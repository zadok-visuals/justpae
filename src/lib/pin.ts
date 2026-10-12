import { createAdminClient } from "@/lib/supabase/admin";
import { sendPinLockedEmail } from "@/lib/email";

/**
 * Server-only. The single place every money action turns a PIN failure into
 * both a counted attempt and a message for the user.
 *
 * WHY THIS FILE EXISTS AT ALL: verify_transaction_pin runs inside the money
 * function's transaction and raises to refuse it. That raise rolls the whole
 * transaction back — so a failed_attempts increment written in SQL at the point
 * of failure is rolled back with it, and the counter can never leave zero.
 * Postgres has no autonomous transaction to escape with. The increment
 * therefore has to happen in a NEW transaction, after the raise has been
 * caught, which means it has to happen here.
 *
 * The consequence to respect: every caller of a PIN-gated RPC must route its
 * error through recordPinFailureIfNeeded, or that path silently has no brute
 * force protection at all. There are three — convert, withdraw, bills — and
 * all three do.
 */

/** `raise … using errcode` values set in supabase/migrations/0012. */
const SQLSTATE_WRONG_PIN = "JP001";
const SQLSTATE_PIN_LOCKED = "JP002";

/** The shape supabase-js hands back for a failed RPC. */
export interface RpcErrorLike {
  code?: string | null;
  message?: string | null;
}

export function isWrongPinError(error: RpcErrorLike | null | undefined): boolean {
  return error?.code === SQLSTATE_WRONG_PIN;
}

export function isPinLockedError(error: RpcErrorLike | null | undefined): boolean {
  return error?.code === SQLSTATE_PIN_LOCKED;
}

/**
 * Call with the error from ANY PIN-gated RPC. Returns the message to show the
 * user — which is the RPC's own message for everything that isn't a PIN
 * problem, so a balance or routing error is still reported accurately.
 *
 * On a wrong PIN this records the attempt, and if that attempt is the one that
 * tipped the account into a lockout, emails the user once. Never throws:
 * bookkeeping and notification failures must not replace the real error the
 * user needs to see.
 */
export async function resolvePinError(params: {
  userId: string;
  email: string | null | undefined;
  error: RpcErrorLike;
}): Promise<string> {
  const { userId, email, error } = params;
  const fallback = error.message ?? "Something went wrong. Please try again.";

  if (isPinLockedError(error)) {
    // Already locked. Deliberately NOT counted — otherwise hammering a locked
    // PIN extends the lock indefinitely and the email fires repeatedly. The
    // message already names when they can retry.
    return fallback;
  }

  if (!isWrongPinError(error)) return fallback;

  try {
    const admin = createAdminClient();
    const { data, error: recordError } = await admin.rpc("record_pin_failure", {
      p_user_id: userId,
    });

    if (recordError) {
      console.error("[pin.resolvePinError] record_pin_failure failed", {
        userId,
        error: recordError,
      });
      return fallback;
    }

    // RETURNS TABLE comes back as an array of one row.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return fallback;

    if (row.just_locked && row.locked_until_at) {
      const minutes = minutesUntil(row.locked_until_at);

      if (email) {
        // Not awaited for its result's sake — but awaited nonetheless, because
        // a serverless function that returns before its fetch settles may be
        // frozen mid-flight and never send it at all.
        await sendPinLockedEmail({ to: email, minutes });
      }

      return `Too many incorrect PIN attempts. Your PIN is locked for about ${minutes} minutes.`;
    }

    return fallback;
  } catch (err) {
    console.error("[pin.resolvePinError] threw", {
      userId,
      error: err instanceof Error ? err.message : err,
    });
    return fallback;
  }
}

function minutesUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 30;
  return Math.max(1, Math.ceil(ms / 60000));
}

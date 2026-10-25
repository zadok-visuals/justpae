"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOwnedUpload } from "@/lib/storage/verifyUpload";
import { getManualDepositConfig } from "@/lib/settings";
import {
  isManualDepositConfigured,
  validateManualDepositAmount,
} from "@/lib/deposits/manualDeposit";
import { DEPOSIT_PROOF_BUCKET } from "@/lib/deposits/proofBucket";
import { NGN_MANUAL_DEPOSIT } from "@/lib/flags";
import { formatAmount } from "@/lib/currencies";
import { notifyAdminsManualDepositSent } from "@/lib/notify/events";

/**
 * NGN deposits by manual bank transfer — the customer's two actions.
 *
 * NEITHER OF THESE MOVES MONEY, and that is the whole shape of this rail. The
 * customer creates a request, then says they have sent a transfer. A human
 * reading a bank statement is the only thing that credits a wallet, through
 * approve_manual_deposit (migration 0037) in the admin actions beside this.
 *
 * Both RPCs are revoked from anon and authenticated, so both go through the
 * service-role client — and both take the user id as a server-read argument
 * from supabase.auth.getUser(), never from the form. create_manual_deposit
 * re-checks KYC and suspension itself; the checks here exist so the customer
 * gets a screen instead of an exception.
 *
 * NO PROVIDER NAMES, and never the word "exchange". This is a bank transfer to
 * the company's account, and that is all the copy may say.
 */

export interface ManualDepositState {
  error?: string;
  depositId?: string;
  reference?: string;
  /** What the customer said they would send. Echoed back for the instructions screen. */
  amount?: string;
}

export async function startManualDeposit(
  _prevState: ManualDepositState,
  formData: FormData,
): Promise<ManualDepositState> {
  if (!NGN_MANUAL_DEPOSIT) {
    return { error: "Naira deposits are unavailable right now. Please try again later." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const amount = Number(String(formData.get("amount") ?? "").replace(/,/g, ""));

  const config = await getManualDepositConfig();
  if (!isManualDepositConfigured(config)) {
    // Not the customer's problem, and not something they can retry their way
    // out of — so it says what it is rather than "something went wrong".
    console.error("[manualDeposit.start] the receiving account is not configured");
    return {
      error: "Naira deposits are being set up and aren't open yet. Please try again later.",
    };
  }

  const invalid = validateManualDepositAmount(amount, config, (value) =>
    formatAmount("NGN", value),
  );
  if (invalid) return { error: invalid };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_manual_deposit", {
    p_user_id: user.id,
    p_amount: amount,
  });

  if (error) {
    console.error("[manualDeposit.start] create_manual_deposit failed", {
      userId: user.id,
      error,
    });
    // The function's own messages — the KYC gate, the suspension refusal, the
    // limits — are written to be read by a customer, so they are shown. The
    // fallback covers a genuine fault.
    return { error: error.message || "We couldn't start that deposit. Please try again." };
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.deposit_id || !row.reference) {
    console.error("[manualDeposit.start] create_manual_deposit returned no row", { data });
    return { error: "We couldn't start that deposit. Please try again." };
  }

  revalidatePath("/transactions");
  return {
    depositId: row.deposit_id,
    reference: row.reference,
    amount: String(amount),
  };
}

export interface MarkSentState {
  error?: string;
  ok?: boolean;
}

/**
 * "I've sent it" — moves pending → awaiting_review and nothing else.
 *
 * THE SCREENSHOT PATH IS UNTRUSTED CLIENT INPUT. The browser uploads straight
 * to the private bucket (see clientUpload.ts and the production crash it
 * fixes), so what arrives here is a string the client chose. The storage
 * policy stops a user WRITING outside their own folder; nothing stops them
 * REFERENCING someone else's, which would attach another customer's bank
 * screenshot to this deposit for an admin to read. verifyOwnedUpload is what
 * closes that, exactly as it does for KYC documents.
 *
 * A bad path drops the screenshot rather than failing the whole action: the
 * upload is optional, the deposit is matched by its reference, and refusing to
 * record "I have sent this money" because a photo did not stick would be the
 * worse failure.
 */
export async function markManualDepositSent(
  _prevState: MarkSentState,
  formData: FormData,
): Promise<MarkSentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const depositId = String(formData.get("depositId") ?? "");
  if (!depositId) return { error: "Missing deposit." };

  const rawPath = String(formData.get("screenshotPath") ?? "").trim();
  let screenshotPath: string | null = null;
  if (rawPath) {
    const owned = await verifyOwnedUpload(supabase, DEPOSIT_PROOF_BUCKET, user.id, rawPath);
    if (owned) {
      screenshotPath = rawPath;
    } else {
      console.warn("[manualDeposit.markSent] rejected an unowned or missing screenshot path", {
        userId: user.id,
      });
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mark_manual_deposit_sent", {
    p_user_id: user.id,
    p_deposit_id: depositId,
    p_screenshot_path: screenshotPath,
  });

  if (error) {
    console.error("[manualDeposit.markSent] rpc failed", { depositId, error });
    return { error: "We couldn't record that. Please try again." };
  }

  // false means the row was not this user's, not pending, or not a manual
  // deposit — all of which look the same from here and none of which should
  // say which. The expiry sweep is the common one by a mile.
  if (data !== true) {
    return {
      error:
        "That request is no longer open. Start a new deposit and use the new reference — " +
        "a request expires 24 hours after it's created if it isn't marked as sent.",
    };
  }

  await notifyAdminsManualDepositSent(depositId);

  revalidatePath("/transactions");
  revalidatePath("/home");
  return { ok: true };
}

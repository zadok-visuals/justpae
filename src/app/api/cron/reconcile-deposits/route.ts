import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransfer } from "@/lib/busha/client";
import { requireCronSecret, staleCutoff } from "@/lib/cron/auth";
import { notifyDepositCredited } from "@/lib/notify/events";

/**
 * Safety net for deposits that are still pending long after they should have
 * settled — independent of whether the webhook is healthy at all.
 *
 * This exists because a deposit nobody is actively watching has no other path
 * to resolution. The user-facing status poll self-heals for anyone sitting on
 * the deposit screen; this is for everyone who closed the tab.
 *
 * NEEDS AN EXTERNAL SCHEDULER. This is not wired to a platform cron: the
 * hosting plan's cron allows only a once-daily schedule and rejects a more
 * frequent config at deploy time — which, on the project this is modelled on,
 * silently broke every deploy for weeks INCLUDING the webhook fix this route
 * was meant to back up. Point something like cron-job.org at it every 15
 * minutes with `Authorization: Bearer <CRON_SECRET>`.
 *
 * Scoped to the primary provider. The secondary (GHS) path is flagged off and
 * has no status endpoint implemented, so there is nothing to reconcile there.
 */
export async function GET(request: Request) {
  const rejected = requireCronSecret(request, "reconcile-deposits");
  if (rejected) return rejected;

  const admin = createAdminClient();

  const { data: staleDeposits } = await admin
    .from("deposits")
    .select("id, provider_reference, pay_in_expires_at")
    .eq("provider", "busha")
    .eq("status", "pending")
    .lt("created_at", staleCutoff())
    .not("provider_reference", "is", null);

  const results: { depositId: string; outcome: string }[] = [];

  for (const deposit of staleDeposits ?? []) {
    if (!deposit.provider_reference) continue;

    try {
      const transfer = await getTransfer(deposit.provider_reference);

      if (transfer.status === "funds_received") {
        // Credit what actually arrived. The transfer object self-corrects to
        // the real confirmed amount, which can differ from what was requested.
        const { error } = await admin.rpc("credit_deposit", {
          p_deposit_id: deposit.id,
          p_actual_amount: Number(transfer.target_amount),
        });
        if (error) {
          console.error("[reconcile-deposits] credit_deposit failed", {
            depositId: deposit.id,
            error,
          });
          results.push({ depositId: deposit.id, outcome: `credit failed: ${error.message}` });
        } else {
          console.warn("[reconcile-deposits] credited a deposit the webhook missed", {
            depositId: deposit.id,
          });
          // This path matters MORE than the webhook's, not less: the user
          // closed the tab, the webhook never arrived, and this notification
          // is the only way they find out the money landed.
          await notifyDepositCredited(deposit.id);
          results.push({ depositId: deposit.id, outcome: "credited" });
        }
      } else if (transfer.status === "cancelled" || transfer.status === "funds_not_delivered") {
        const { error } = await admin.rpc("fail_deposit", {
          p_deposit_id: deposit.id,
          p_reason: `Provider reported ${transfer.status}`,
        });
        if (error) {
          console.error("[reconcile-deposits] fail_deposit failed", {
            depositId: deposit.id,
            error,
          });
        }
        results.push({ depositId: deposit.id, outcome: `marked failed (${transfer.status})` });
      } else if (
        // GROUP 4b — the expiry sweep.
        //
        // ORDER MATTERS, and this branch is deliberately LAST among the
        // provider-informed ones. The provider is asked first and believed
        // first: if it says funds_received, the money is credited even though
        // the pay-in window has closed, because an arrival in the final
        // seconds is a real deposit and not a missed deadline. Only once the
        // provider has confirmed the transfer is still sitting unpaid does
        // the deadline get to end it.
        deposit.pay_in_expires_at != null &&
        new Date(deposit.pay_in_expires_at).getTime() <= Date.now()
      ) {
        // expire_deposit re-checks the deadline and the confirmed amount
        // under a row lock, so the race against a webhook crediting this same
        // row between the fetch above and this call resolves in favour of the
        // credit. See migration 0030.
        const { data: expired, error } = await admin.rpc("expire_deposit", {
          p_deposit_id: deposit.id,
        });
        if (error) {
          console.error("[reconcile-deposits] expire_deposit failed", {
            depositId: deposit.id,
            error,
          });
          results.push({ depositId: deposit.id, outcome: `expire failed: ${error.message}` });
        } else {
          results.push({
            depositId: deposit.id,
            outcome: expired ? "expired" : "expiry declined (credited or already settled)",
          });
        }
      } else {
        results.push({ depositId: deposit.id, outcome: `still ${transfer.status}` });
      }
    } catch (err) {
      console.error("[reconcile-deposits] provider lookup failed", {
        depositId: deposit.id,
        err,
      });
      results.push({
        depositId: deposit.id,
        outcome: err instanceof Error ? err.message : "check failed",
      });
    }
  }

  return NextResponse.json({ checked: results.length, results });
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransfer } from "@/lib/busha/client";
import { requireCronSecret, staleCutoff } from "@/lib/cron/auth";

/**
 * Safety net for `transactions` rows waiting on a provider transfer — the
 * counterpart to reconcile-deposits, same shape, different table.
 *
 * Covers conversions (which only complete synchronously on an unambiguous
 * immediate response) and automated withdrawal payouts. Both are polled
 * identically; only the completion and failure functions differ by type.
 *
 * Needs the same external scheduler, every 15 minutes, with
 * `Authorization: Bearer <CRON_SECRET>`. See reconcile-deposits for why a
 * platform cron is not used.
 */
export async function GET(request: Request) {
  const rejected = requireCronSecret(request, "reconcile-transfers");
  if (rejected) return rejected;

  const admin = createAdminClient();

  const { data: stale } = await admin
    .from("transactions")
    .select("id, type, provider_reference")
    .eq("provider", "busha")
    .in("status", ["pending", "processing"])
    .lt("created_at", staleCutoff())
    .not("provider_reference", "is", null);

  const results: { transactionId: string; outcome: string }[] = [];

  for (const tx of stale ?? []) {
    if (!tx.provider_reference) continue;
    const isWithdrawal = tx.type === "withdrawal";

    try {
      const transfer = await getTransfer(tx.provider_reference);

      if (transfer.status === "funds_converted" || transfer.status === "funds_delivered") {
        const { error } = isWithdrawal
          ? await admin.rpc("complete_withdrawal_payout", { p_transaction_id: tx.id })
          : await admin.rpc("complete_conversion", { p_transaction_id: tx.id });

        if (error) {
          console.error("[reconcile-transfers] completion failed", { transactionId: tx.id, error });
          results.push({ transactionId: tx.id, outcome: `complete failed: ${error.message}` });
        } else {
          console.warn("[reconcile-transfers] completed a transfer the webhook missed", {
            transactionId: tx.id,
          });
          results.push({ transactionId: tx.id, outcome: "completed" });
        }
      } else if (transfer.status === "cancelled" || transfer.status === "funds_not_delivered") {
        const reason = `Provider reported ${transfer.status}`;
        const { error } = isWithdrawal
          ? await admin.rpc("fail_withdrawal_payout", {
              p_transaction_id: tx.id,
              p_reason: reason,
            })
          : await admin.rpc("fail_conversion", { p_transaction_id: tx.id, p_reason: reason });

        if (error) {
          console.error("[reconcile-transfers] failure handling failed", {
            transactionId: tx.id,
            error,
          });
        }
        results.push({ transactionId: tx.id, outcome: `marked failed (${transfer.status})` });
      } else {
        results.push({ transactionId: tx.id, outcome: `still ${transfer.status}` });
      }
    } catch (err) {
      console.error("[reconcile-transfers] provider lookup failed", {
        transactionId: tx.id,
        err,
      });
      results.push({
        transactionId: tx.id,
        outcome: err instanceof Error ? err.message : "check failed",
      });
    }
  }

  return NextResponse.json({ checked: results.length, results });
}

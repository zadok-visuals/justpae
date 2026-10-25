import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransfer } from "@/lib/busha/client";
import { requireCronSecret, staleCutoff } from "@/lib/cron/auth";
import { verifyTransferMatchesRow } from "@/lib/transfers/verify";
import {
  notifyConversionCompleted,
  notifyWithdrawalCompleted,
  notifyWithdrawalFailed,
} from "@/lib/notify/events";
import { korapaySettlePayoutDeps } from "@/lib/korapay/payoutDeps";
import { settleKorapayPayout, type SettlePayoutOutcome } from "@/lib/korapay/payout";

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

  // FIRST, before anything that talks to the provider: give back any money
  // sitting in an abandoned conversion hold.
  //
  // A hold is taken before the provider call and resolved after it, so the one
  // case the action itself cannot clean up is the process dying in between.
  // That money is out of the user's balance and attached to nothing. Fifteen
  // minutes is far longer than any provider call this app makes, so anything
  // older is abandoned rather than slow. See migration 0022.
  //
  // It runs first because it needs no network and must not be skipped by an
  // early return or a provider outage further down.
  let holdsReleased = 0;
  const { data: released, error: holdError } = await admin.rpc("expire_stale_conversion_holds", {});
  if (holdError) {
    console.error("[reconcile-transfers] could not sweep stale conversion holds", holdError);
  } else {
    holdsReleased = released ?? 0;
    if (holdsReleased > 0) {
      console.warn("[reconcile-transfers] released abandoned conversion holds", { holdsReleased });
    }
  }

  /**
   * GROUP 3d — Korapay payouts, before the Busha loop and independent of it.
   *
   * THIS IS THE PRIMARY PATH IN THE SANDBOX, not a backstop: no webhook URL
   * is configured there, so without this a sandbox payout never settles at
   * all. Both triggers go through settleKorapayPayout, so the state change
   * comes from a fresh provider query either way.
   */
  const korapayOutcomes: { transactionId: string; outcome: SettlePayoutOutcome }[] = [];
  {
    const { data: korapayRows } = await admin
      .from("transactions")
      .select("id, provider_reference")
      .eq("type", "withdrawal")
      .eq("provider", "korapay")
      .in("status", ["pending", "processing"])
      .eq("needs_manual_review", false)
      .not("provider_reference", "is", null)
      .order("created_at", { ascending: true });

    const deps = korapaySettlePayoutDeps(admin, "korapay reconcile");
    for (const row of korapayRows ?? []) {
      if (!row.provider_reference) continue;
      try {
        korapayOutcomes.push({
          transactionId: row.id,
          outcome: await settleKorapayPayout(deps, row.provider_reference),
        });
      } catch (err) {
        console.error("[reconcile-transfers] korapay payout check failed", {
          transactionId: row.id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
  }

  const { data: stale } = await admin
    .from("transactions")
    // The amount and currency columns are selected because completion is no
    // longer allowed on the provider's status alone — the transfer has to
    // describe THIS row. See src/lib/transfers/verify.ts.
    // The leg columns come too: on a two-leg conversion provider_reference is
    // LEG 2's, whose source is USDT rather than the row's own currency, and
    // verifyTransferMatchesRow needs the bridge trail to know that. Without
    // them every correctly-executed fiat-to-fiat conversion would be flagged
    // for manual review instead of completing.
    .select(
      "id, type, provider_reference, amount, currency, target_currency, target_amount, raw_target_amount, markup_rate, bridge_currency, leg1_provider_reference, leg2_provider_reference, leg1_target_amount",
    )
    .eq("provider", "busha")
    .in("status", ["pending", "processing"])
    // A row already flagged as mismatched is left alone: it is waiting for a
    // human, and re-checking it every 15 minutes only rewrites the same flag.
    .eq("needs_manual_review", false)
    .lt("created_at", staleCutoff())
    .not("provider_reference", "is", null);

  const results: { transactionId: string; outcome: string }[] = [];

  for (const tx of stale ?? []) {
    if (!tx.provider_reference) continue;
    const isWithdrawal = tx.type === "withdrawal";

    try {
      const transfer = await getTransfer(tx.provider_reference);

      // BEFORE any completion. A transfer that is finished but is not this
      // row's transfer must never credit this row — that was exactly the
      // second half of the conversion attack closed in migration 0010.
      const match = verifyTransferMatchesRow(tx, transfer);
      if (!match.matches) {
        console.error("[reconcile-transfers] provider transfer does not match row", {
          transactionId: tx.id,
          providerReference: tx.provider_reference,
          reason: match.reason,
        });
        await admin.rpc("flag_transaction_for_review", {
          p_transaction_id: tx.id,
          p_reason: match.reason ?? "Provider transfer does not match this row",
        });
        results.push({ transactionId: tx.id, outcome: "flagged for manual review (mismatch)" });
        continue;
      }

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
          // As with reconcile-deposits: this is the path where the webhook
          // never came, so it is the only notification the user will get.
          if (isWithdrawal) await notifyWithdrawalCompleted(tx.id);
          else await notifyConversionCompleted(tx.id);
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
        } else if (isWithdrawal) {
          // Withdrawals only — that is the path that refunds the wallet, and
          // the refund is the whole point of the message.
          await notifyWithdrawalFailed(tx.id, reason);
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

  return NextResponse.json({
    checked: results.length,
    holdsReleased,
    korapay: korapayOutcomes,
    results,
  });
}

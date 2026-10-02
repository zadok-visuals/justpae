import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import { getPayoutChannel, createBushaRecipient, createPayoutTransfer } from "@/lib/busha/payout";
import { MINIMUM_WITHDRAWAL_USDT_THRESHOLD } from "@/lib/busha/limits";
import { evaluateWithdrawalRouting } from "@/lib/withdrawals/threshold";

/**
 * Server-only. Attempts the automated payout for a withdrawal that
 * create_withdrawal_request has already approved — the wallet is debited and
 * the transaction row exists as pending/manual by the time this runs.
 *
 * THE INVARIANT: nothing in here may throw past this function. A user's
 * already-debited withdrawal must never be stranded by a payout-API hiccup. On
 * any failure the row stays exactly as create_withdrawal_request left it and
 * falls back to the manual admin queue.
 *
 * Called twice for the same row in the worst case: synchronously from
 * requestWithdrawal, and later by the retry-withdrawal-automation cron for
 * rows whose first attempt threw before a provider transfer ever existed.
 *
 * The distinction that matters, and the reason record_automated_payout_failure
 * exists at all: a row that is manual BY DESIGN (above the threshold, or a
 * currency with no payout channel) and a row that is manual because the
 * automation BROKE mid-flight look identical in the database otherwise —
 * provider 'manual', status 'pending' — which makes the second kind invisible
 * to both the reconcile cron (it only polls provider 'busha' rows) and the
 * admin queue. Every by-design branch below returns cleanly without touching
 * the failure columns; reaching the catch always means a real candidate broke.
 */

export { MINIMUM_WITHDRAWAL_USDT_THRESHOLD };

/**
 * After this many failed automation attempts the retry cron gives up and
 * leaves the row for manual review. Bounded on purpose: an endlessly retried
 * payout against a provider that keeps rejecting it is just a slower way of
 * never paying the user.
 */
export const AUTOMATED_PAYOUT_MAX_RETRY_ATTEMPTS = 3;

type AdminClient = ReturnType<typeof createAdminClient>;

async function clearAutomatedPayoutFailure(admin: AdminClient, transactionId: string) {
  await admin
    .from("transactions")
    .update({ automated_payout_attempt_failed_reason: null, automated_payout_retry_count: 0 })
    .eq("id", transactionId);
}

export async function attemptAutomatedPayout(
  transactionId: string,
  userId: string,
  currency: Currency,
  amount: number,
) {
  const admin = createAdminClient();

  try {
    // Routing and the recipient fetch are independent — start both together
    // rather than paying two sequential round trips. The recipient read is
    // wasted in the over-threshold case, which is the less common path.
    const [routing, recipientResult] = await Promise.all([
      evaluateWithdrawalRouting({
        userId,
        currency,
        amount,
        // The row already exists at this point, so exclude it from its own
        // rolling window — otherwise this request is counted twice and every
        // withdrawal over half the threshold routes to manual review.
        excludeTransactionId: transactionId,
      }),
      admin
        .from("withdrawal_recipients")
        .select("*")
        .eq("user_id", userId)
        .eq("currency", currency)
        .maybeSingle(),
    ]);

    const recipient = recipientResult.data;

    if (!routing.automated) {
      const channel = getPayoutChannel(currency);
      if (!channel) {
        // Definitively not automatable, ever. Clear any stale failure reason
        // from an earlier attempt so the admin badge does not linger and the
        // retry cron stops retrying something that can never succeed. This
        // branch never increments the retry counter.
        await clearAutomatedPayoutFailure(admin, transactionId);
        return;
      }
      // Over the threshold, or over it once the rolling window is counted:
      // flag for the extra-verification gate and leave it in the manual queue.
      await admin.rpc("flag_withdrawal_for_verification", { p_transaction_id: transactionId });
      return;
    }

    // Below the provider's own minimum payout amount. Detected here with a
    // clear reason of our own rather than by calling the provider and
    // recording whatever generic validation error comes back. Recorded as a
    // failure (bounded by the retry cap) rather than flagged for
    // verification — this needs manual handling, not identity re-checks.
    if (routing.requestUsd < MINIMUM_WITHDRAWAL_USDT_THRESHOLD) {
      await admin.rpc("record_automated_payout_failure", {
        p_transaction_id: transactionId,
        p_reason: `Below the provider's minimum payout amount (${MINIMUM_WITHDRAWAL_USDT_THRESHOLD} USD equivalent)`,
      });
      return;
    }

    if (!recipient) {
      await clearAutomatedPayoutFailure(admin, transactionId);
      return;
    }

    const channel = getPayoutChannel(currency)!;

    // Crypto payouts use no Recipient at all, so nothing is created or cached
    // for that channel.
    let recipientId: string | undefined;
    if (channel.recipientType !== "crypto") {
      recipientId = recipient.busha_recipient_id ?? undefined;
      if (!recipientId) {
        recipientId = await createBushaRecipient(currency, recipient);
        await admin.rpc("set_busha_recipient_id", {
          p_user_id: userId,
          p_currency: currency,
          p_recipient_id: recipientId,
        });
      }
    }

    const transfer = await createPayoutTransfer(currency, amount, recipient, recipientId);

    await admin.rpc("mark_withdrawal_processing", {
      p_transaction_id: transactionId,
      p_provider_reference: transfer.id,
    });
    await clearAutomatedPayoutFailure(admin, transactionId);

    // Complete synchronously only when the provider's own response already
    // says so; otherwise leave it for reconciliation. funds_delivered is the
    // provider's terminal status for payouts specifically.
    if (transfer.status === "funds_delivered") {
      await admin.rpc("complete_withdrawal_payout", { p_transaction_id: transactionId });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[attemptAutomatedPayout] failed, leaving for manual review", {
      transactionId,
      currency,
      error: reason,
    });
    await admin.rpc("record_automated_payout_failure", {
      p_transaction_id: transactionId,
      // Generous cap: a specific provider validation detail must not get cut
      // off before it says which field actually failed.
      p_reason: reason.slice(0, 1000),
    });
  }
}

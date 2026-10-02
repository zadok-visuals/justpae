import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  attemptAutomatedPayout,
  AUTOMATED_PAYOUT_MAX_RETRY_ATTEMPTS,
} from "@/lib/withdrawals/automated-payout";
import { requireCronSecret } from "@/lib/cron/auth";

/**
 * Retries withdrawals whose automated payout failed BEFORE a provider transfer
 * ever existed — a rate probe, a recipient creation, or a provider API error.
 *
 * Those rows are the reason record_automated_payout_failure exists. They are
 * still provider 'manual' and status 'pending', so reconcile-transfers cannot
 * see them (it only polls provider 'busha' rows), and in the admin queue they
 * look exactly like a legitimately-manual above-threshold withdrawal. Without
 * this route they sit there indefinitely with nothing indicating they were
 * ever meant to be automatic.
 *
 * Bounded by AUTOMATED_PAYOUT_MAX_RETRY_ATTEMPTS: after that the row is left
 * for a human. Retrying forever against a provider that keeps refusing is just
 * a slower way of never paying the user.
 *
 * Needs the same external scheduler, every 15 minutes, with
 * `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const rejected = requireCronSecret(request, "retry-withdrawal-automation");
  if (rejected) return rejected;

  const admin = createAdminClient();

  const { data: candidates } = await admin
    .from("transactions")
    .select("id, user_id, currency, amount")
    .eq("type", "withdrawal")
    .eq("status", "pending")
    .eq("provider", "manual")
    .not("automated_payout_attempt_failed_reason", "is", null)
    .lt("automated_payout_retry_count", AUTOMATED_PAYOUT_MAX_RETRY_ATTEMPTS);

  for (const tx of candidates ?? []) {
    // attemptAutomatedPayout never throws — a failure here records itself and
    // increments the retry counter, so one bad row cannot abort the batch.
    await attemptAutomatedPayout(tx.id, tx.user_id, tx.currency, tx.amount);
  }

  return NextResponse.json({ retried: candidates?.length ?? 0 });
}

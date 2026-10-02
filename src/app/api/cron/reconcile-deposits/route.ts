import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransfer } from "@/lib/busha/client";
import { requireCronSecret, staleCutoff } from "@/lib/cron/auth";

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
    .select("id, provider_reference")
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

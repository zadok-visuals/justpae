import type { BushaTransfer } from "@/lib/busha/client";
import type { Transaction } from "@/lib/types/database";

/**
 * Server-only. Does the provider's own transfer object actually describe THIS
 * ledger row?
 *
 * WHY THIS EXISTS. Both completion paths — the reconcile cron and the webhook —
 * found their row by provider_reference and then completed it on the provider's
 * status alone. Re-fetching the transfer from the provider (which both already
 * did) proves the transfer is real and finished. It does NOT prove the transfer
 * is the one this row was created for.
 *
 * That distinction was the second half of the conversion attack closed in
 * migration 0010: a row whose provider_reference pointed at some OTHER
 * completed transfer passed every check, because every check only ever asked
 * "is the referenced transfer done?" and never "is it this?". The unique index
 * on (provider, provider_reference) now makes the collision impossible to
 * create, and this makes it impossible to settle — defence at both ends,
 * because the index protects new rows and this protects rows that already
 * exist.
 *
 * ON MISMATCH, NOTHING COMPLETES. The row is flagged for manual review instead.
 * Silently skipping would be indistinguishable from "still in flight" and would
 * leave the row to be retried forever by the next cron tick.
 *
 * TOLERANCE. Comparison is on rounded currency amounts with a small absolute
 * tolerance, because the provider reports decimal strings it has rounded its
 * own way and a ledger column is numeric(18,2). The tolerance is absolute
 * rather than proportional on purpose: a proportional tolerance on a large
 * conversion is a large number of real currency units.
 */

/** Half a minor unit each way, plus a hair for float representation. */
const AMOUNT_TOLERANCE = 0.011;

export interface TransferMatchResult {
  matches: boolean;
  /** Present when matches is false. Safe to store on the row and to log. */
  reason?: string;
}

type ReconcilableRow = Pick<
  Transaction,
  "type" | "amount" | "currency" | "target_currency" | "target_amount" | "raw_target_amount"
>;

export function verifyTransferMatchesRow(
  row: ReconcilableRow,
  transfer: BushaTransfer,
): TransferMatchResult {
  const problems: string[] = [];

  const transferSourceCurrency = normaliseCurrency(transfer.source_currency);
  const transferTargetCurrency = normaliseCurrency(transfer.target_currency);
  const transferSourceAmount = Number(transfer.source_amount);
  const transferTargetAmount = Number(transfer.target_amount);

  // ── Currencies ───────────────────────────────────────────────────────────
  if (transferSourceCurrency && transferSourceCurrency !== row.currency) {
    problems.push(
      `source currency ${transferSourceCurrency} does not match row currency ${row.currency}`,
    );
  }

  if (row.target_currency && transferTargetCurrency && transferTargetCurrency !== row.target_currency) {
    problems.push(
      `target currency ${transferTargetCurrency} does not match row target ${row.target_currency}`,
    );
  }

  // ── Source amount ────────────────────────────────────────────────────────
  // The same for both row types: the source amount is what left our account,
  // and for both conversions and payouts that is the row's `amount`.
  if (Number.isFinite(transferSourceAmount)) {
    if (!within(transferSourceAmount, row.amount)) {
      problems.push(
        `source amount ${transferSourceAmount} does not match row amount ${row.amount}`,
      );
    }
  } else {
    problems.push("provider reported no usable source amount");
  }

  // ── Target amount ────────────────────────────────────────────────────────
  // CONVERSIONS: compare against raw_target_amount, NOT target_amount.
  // target_amount is the customer figure — the provider's delivery with our
  // markup already deducted — so comparing the provider's own number against it
  // would flag every single correctly-priced conversion as a mismatch. The
  // provider's delivery is raw_target_amount by construction.
  //
  // WITHDRAWALS: the payout transfer has no meaningful target leg to check
  // against (the row's target_amount is the fee-net figure, and the payout is
  // created for the gross), so only the source side and the currency are
  // verified. That is still the check that matters: it is what ties the
  // transfer to this row.
  if (row.type === "convert" && Number.isFinite(transferTargetAmount)) {
    const expected = row.raw_target_amount ?? row.target_amount;
    if (expected != null && !within(transferTargetAmount, expected)) {
      problems.push(
        `target amount ${transferTargetAmount} does not match the row's recorded provider delivery ${expected}`,
      );
    }
  }

  if (problems.length === 0) return { matches: true };

  return {
    matches: false,
    reason: `Provider transfer does not match this row: ${problems.join("; ")}`,
  };
}

function within(a: number, b: number): boolean {
  return Math.abs(round2(a) - round2(b)) <= AMOUNT_TOLERANCE;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * The provider is inconsistent about case and occasionally omits a leg
 * entirely. An ABSENT currency is not treated as a mismatch — there is nothing
 * to disagree with, and the amount checks still have to pass — but a PRESENT
 * one that differs is.
 */
function normaliseCurrency(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

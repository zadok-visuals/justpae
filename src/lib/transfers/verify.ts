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
 *
 * TWO LEGS (0024). A fiat-to-fiat conversion is not one transfer but two,
 * bridged through USDT, and the row's `provider_reference` is LEG 2's. Leg 2's
 * source is USDT and its source amount is the bridge figure — neither of which
 * is the row's own `currency` or `amount`. Checking a bridged row against the
 * single-leg expectations would therefore report a mismatch for every
 * correctly-executed NGN-to-KES conversion and flag the lot for manual review,
 * which is a failure mode worth more than the check it came from. So the leg
 * is identified FIRST, by reference, and each leg is checked against what that
 * leg is actually supposed to say.
 *
 * Identifying by reference rather than by currency is deliberate: it is a
 * strictly stronger tie than the old check, because a transfer that is neither
 * of the row's two recorded legs is now a mismatch by name rather than having
 * to be caught by its amounts.
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
  | "type"
  | "amount"
  | "currency"
  | "target_currency"
  | "target_amount"
  | "raw_target_amount"
  | "bridge_currency"
  | "leg1_provider_reference"
  | "leg2_provider_reference"
  | "leg1_target_amount"
  | "markup_rate"
>;

/**
 * The bridge amount is not stored directly — it is recovered by undoing the
 * markup on a figure that was already rounded to the minor unit, and the leg
 * itself was created from a separately rounded string. Two roundings and a
 * division put the exact answer slightly outside half a minor unit, so the
 * strict tolerance would flag correct conversions.
 *
 * Five minor units. Still three orders of magnitude tighter than any real
 * difference between two unrelated transfers, which is what this check is for
 * — it exists to catch "that is somebody else's transfer", not to audit the
 * provider's rounding.
 */
const DERIVED_AMOUNT_TOLERANCE = 0.05;

/** What one side of a transfer is expected to say. A null amount means the
 *  row records no figure to check that side against, so only the currency is. */
interface SideExpectation {
  currency: string | null;
  amount: number | null;
  /** True when `amount` was derived rather than read straight off the row. */
  derived?: boolean;
}

export function verifyTransferMatchesRow(
  row: ReconcilableRow,
  transfer: BushaTransfer,
): TransferMatchResult {
  const problems: string[] = [];

  const transferSourceCurrency = normaliseCurrency(transfer.source_currency);
  const transferTargetCurrency = normaliseCurrency(transfer.target_currency);
  const transferSourceAmount = Number(transfer.source_amount);
  const transferTargetAmount = Number(transfer.target_amount);

  // ── Which leg is this? ───────────────────────────────────────────────────
  const leg = identifyLeg(row, transfer);
  if (leg === "unknown") {
    return {
      matches: false,
      reason:
        `Provider transfer does not match this row: transfer ${transfer.id} is neither ` +
        `leg of this two-leg conversion (leg 1 ${row.leg1_provider_reference ?? "none"}, ` +
        `leg 2 ${row.leg2_provider_reference ?? "none"})`,
    };
  }

  const { source, target } = expectationsForLeg(row, leg);

  // ── Currencies ───────────────────────────────────────────────────────────
  if (transferSourceCurrency && source.currency && transferSourceCurrency !== source.currency) {
    problems.push(
      `source currency ${transferSourceCurrency} does not match the expected ${source.currency} for ${describeLeg(leg)}`,
    );
  }

  if (transferTargetCurrency && target.currency && transferTargetCurrency !== target.currency) {
    problems.push(
      `target currency ${transferTargetCurrency} does not match the expected ${target.currency} for ${describeLeg(leg)}`,
    );
  }

  // ── Source amount ────────────────────────────────────────────────────────
  // What left our account on this leg. On a single leg and on leg 1 that is
  // the row's own `amount`; on leg 2 it is the USDT leg 1 produced.
  if (!Number.isFinite(transferSourceAmount)) {
    problems.push("provider reported no usable source amount");
  } else if (source.amount != null && !within(transferSourceAmount, source.amount, source.derived)) {
    problems.push(
      `source amount ${transferSourceAmount} does not match the expected ${source.amount} for ${describeLeg(leg)}`,
    );
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
  if (
    row.type === "convert" &&
    Number.isFinite(transferTargetAmount) &&
    target.amount != null &&
    !within(transferTargetAmount, target.amount, target.derived)
  ) {
    problems.push(
      `target amount ${transferTargetAmount} does not match the row's recorded provider delivery ${target.amount} for ${describeLeg(leg)}`,
    );
  }

  if (problems.length === 0) return { matches: true };

  return {
    matches: false,
    reason: `Provider transfer does not match this row: ${problems.join("; ")}`,
  };
}

type Leg = "single" | "leg1" | "leg2" | "unknown";

function describeLeg(leg: Exclude<Leg, "unknown">): string {
  return leg === "single" ? "this conversion" : leg === "leg1" ? "leg 1" : "leg 2";
}

/**
 * A row with no bridge currency ran as one transfer, so there is no leg to
 * pick. A bridged row names both of its legs, and the transfer must be one of
 * them — the webhook and the reconciler both look the row up by
 * `provider_reference` (leg 2's), but a webhook for leg 1 can still arrive,
 * and it describes a genuinely different pair.
 */
function identifyLeg(row: ReconcilableRow, transfer: BushaTransfer): Leg {
  if (!row.bridge_currency) return "single";
  if (row.leg2_provider_reference && transfer.id === row.leg2_provider_reference) return "leg2";
  if (row.leg1_provider_reference && transfer.id === row.leg1_provider_reference) return "leg1";
  return "unknown";
}

function expectationsForLeg(
  row: ReconcilableRow,
  leg: Exclude<Leg, "unknown">,
): { source: SideExpectation; target: SideExpectation } {
  const finalDelivery = row.raw_target_amount ?? row.target_amount;
  // What the provider actually handed over on leg 1, before our markup.
  // leg1_target_amount is stored markup-ADJUSTED, and leg 2 was created to
  // spend the raw figure, so the markup has to be undone to get back to the
  // number leg 2 will report. Null whenever that cannot be done exactly, in
  // which case the amount check is skipped rather than guessed at — a wrong
  // expectation here flags a correct conversion for manual review.
  const leg1Raw = undoMarkup(row.leg1_target_amount, row.markup_rate);

  switch (leg) {
    case "single":
      return {
        source: { currency: row.currency, amount: row.amount },
        target: { currency: row.target_currency, amount: finalDelivery },
      };
    case "leg1":
      return {
        source: { currency: row.currency, amount: row.amount },
        target: { currency: row.bridge_currency, amount: leg1Raw, derived: true },
      };
    case "leg2":
      return {
        source: { currency: row.bridge_currency, amount: leg1Raw, derived: true },
        target: { currency: row.target_currency, amount: finalDelivery },
      };
  }
}

/**
 * Recovers a pre-markup provider figure from the marked-up one we stored.
 *
 * The inverse of applyMarkupToAmount's `raw * (1 - markup)`. Returns null for
 * anything it cannot invert safely — a missing markup, a markup of 1 (divide
 * by zero), or a nonsensical one — because an unverifiable amount must not
 * become a false mismatch.
 */
export function undoMarkup(markedAmount: number | null, markupRate: number | null): number | null {
  if (markedAmount == null || markupRate == null) return null;
  if (!Number.isFinite(markedAmount) || !Number.isFinite(markupRate)) return null;
  if (markupRate < 0 || markupRate >= 1) return null;
  return markedAmount / (1 - markupRate);
}

function within(a: number, b: number, derived = false): boolean {
  const tolerance = derived ? DERIVED_AMOUNT_TOLERANCE : AMOUNT_TOLERANCE;
  return Math.abs(round2(a) - round2(b)) <= tolerance;
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

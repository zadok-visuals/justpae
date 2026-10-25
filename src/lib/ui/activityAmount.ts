// Relative, extension-bearing imports, as activityAmount.test.ts runs under
// `node --test` with no path-alias resolver. currencies.ts is reached the same
// way by the pickers already.
import { formatAmount, formatSignedAmount } from "../currencies.ts";
import type { Currency, TransactionStatus } from "../types/database.ts";

/**
 * GROUP 2b — WHO IS ALLOWED A GREEN "+".
 *
 * Only money that actually arrived. A failed, expired or cancelled row used
 * to render "+NGN 5,000.00" in success green beside a pill reading "Failed" —
 * the two halves of one row saying opposite things, and the loud half saying
 * the false one. Someone scanning a list reads colour and sign long before
 * they read a pill, so the row announced a credit that never happened.
 *
 * A pending or in-progress credit is not green either: it has not landed yet,
 * and the pill beside it is what says when it will. Green plus means the
 * money is in the wallet now, and nothing else does.
 *
 * Outgoing keeps its minus — a debit that failed is covered by the first rule
 * above, and a debit in flight is money genuinely on its way out.
 */

export type AmountTone = "credit" | "neutral";

export interface ActivityAmount {
  text: string;
  tone: AmountTone;
}

/**
 * The statuses where nothing moved. "cancelled" is not in the Postgres enum
 * today; it is listed because the rule is about the meaning, and a status
 * added later must not quietly fall through to the green branch.
 */
const NOTHING_MOVED = new Set(["failed", "expired", "cancelled"]);

/** True when the row's money never arrived or never left. */
export function isUnsettled(status: TransactionStatus | "refunded" | string): boolean {
  return NOTHING_MOVED.has(status);
}

export function activityAmount(
  currency: Currency,
  amount: number,
  direction: "in" | "out",
  status: TransactionStatus | "refunded" | string,
): ActivityAmount {
  if (isUnsettled(status)) {
    return { text: formatAmount(currency, Math.abs(amount)), tone: "neutral" };
  }
  if (direction === "in") {
    return status === "completed"
      ? { text: formatSignedAmount(currency, amount, "in"), tone: "credit" }
      : { text: formatAmount(currency, Math.abs(amount)), tone: "neutral" };
  }
  return { text: formatSignedAmount(currency, amount, "out"), tone: "neutral" };
}

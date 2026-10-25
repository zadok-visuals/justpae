// Relative, with extensions: manualDeposit.test.ts runs under `node --test`
// with no bundler and therefore no "@/" alias resolution. Same note as
// availability.ts.

/**
 * The shape of the manual NGN bank-transfer deposit configuration, and the
 * rules that have to hold on BOTH sides of the wire.
 *
 * Every check here is mirrored inside create_manual_deposit (migration 0037),
 * which is the enforcement. This module exists so the customer gets a sentence
 * instead of a Postgres exception, and so the rules are unit-testable without
 * a database.
 */

export interface ManualDepositConfig {
  bankName: string;
  accountNumber: string;
  accountName: string;
  minAmount: number;
  maxAmount: number;
  /** Flat naira fee taken off what arrived, before crediting. 0 is normal. */
  fee: number;
}

/** Matches 0037's seeds, and its own fallbacks when a row is missing or empty. */
export const MANUAL_DEPOSIT_DEFAULTS = {
  minAmount: 1000,
  maxAmount: 5_000_000,
  fee: 0,
} as const;

/**
 * JP + 8, from the Crockford-ish alphabet generate_deposit_reference() uses —
 * no I, O, 0 or 1, because this string is read off a screen and typed into a
 * bank app by hand.
 */
export const DEPOSIT_REFERENCE_PATTERN = /^JP[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

export function isValidDepositReference(reference: string | null | undefined): boolean {
  return typeof reference === "string" && DEPOSIT_REFERENCE_PATTERN.test(reference);
}

/**
 * Whether there is an account to send money to.
 *
 * 0037 seeds the bank name and account number EMPTY rather than with a
 * placeholder, because a plausible-looking fake in a field that tells people
 * where to send money is the one default worse than none. So the screen has to
 * be able to tell "not configured" from "configured", and refuse to render
 * instructions in the first case.
 */
export function isManualDepositConfigured(config: ManualDepositConfig): boolean {
  return (
    config.bankName.trim().length > 0 &&
    config.accountNumber.trim().length > 0 &&
    config.accountName.trim().length > 0
  );
}

/**
 * Returns a customer-facing message, or null when the amount is acceptable.
 *
 * The amount is the ONE customer-supplied figure in this whole flow, and it
 * credits nothing — it is a statement of what they intend to send. What
 * actually credits is the figure an admin reads off a bank statement.
 */
export function validateManualDepositAmount(
  amount: number,
  config: Pick<ManualDepositConfig, "minAmount" | "maxAmount">,
  formatAmount: (value: number) => string,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid amount.";
  if (amount < config.minAmount) {
    return `The smallest naira deposit is ${formatAmount(config.minAmount)}.`;
  }
  if (amount > config.maxAmount) {
    return `The largest naira deposit in one request is ${formatAmount(config.maxAmount)}.`;
  }
  return null;
}

/**
 * What the customer will be credited if the full requested amount arrives.
 *
 * A PREVIEW, and never the figure that credits — approve_manual_deposit
 * recomputes this from the admin-entered received amount and the fee read in
 * its own transaction. Shown so a flat fee is visible before the transfer, not
 * discovered after it.
 */
export function previewCredit(amount: number, fee: number): number {
  return Math.max(0, amount - Math.max(0, fee));
}

/**
 * Rules that both the client and the server need to agree on, in a module
 * neither `"use server"` nor `"use client"` — a `"use server"` file may only
 * export async functions (Next.js treats every export as a callable server
 * action), so a shared constant or a synchronous validator cannot live in one.
 *
 * Nothing here is a security boundary. Every rule below is enforced again in
 * Postgres (assert_pin_acceptable, recipient_change_hold_active); these copies
 * exist so the UI can say what's wrong before a round trip, and say it in the
 * same words.
 */

/**
 * How long a newly-changed payout destination is held back from automated
 * payout. Mirrors the interval in confirm_recipient_change_for_user /
 * recipient_change_hold_active (supabase/migrations/0013).
 */
export const RECIPIENT_CHANGE_HOLD_HOURS = 24;

/** New PINs are 6 digits. Existing 4-digit PINs keep working until changed. */
export const TRANSACTION_PIN_LENGTH = 6;

/**
 * The client-side half of assert_pin_acceptable. Returns a message, or null if
 * the PIN is acceptable.
 *
 * WHY THE TRIVIAL-PIN RULES EXIST: six digits is 10^6 candidates, which is a
 * genuine obstacle only if the six digits are unpredictable. Left unchecked,
 * a large share of real PINs are 000000, 123456, or a repeated pair — against
 * which the lockout in 0012 is the only defence, and a lockout that triggers
 * on the first five guesses of a list that starts with the user's actual PIN
 * protects nobody.
 */
export function pinFormatError(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "Your PIN must be exactly 6 digits.";

  if (/^(\d)\1{5}$/.test(pin)) {
    return "That PIN is too easy to guess. Avoid repeating the same digit.";
  }

  // Kept identical to the SQL: a six-character window into either run.
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) {
    return "That PIN is too easy to guess. Avoid sequential digits.";
  }

  // 010101 / 121212 (a 2-digit cycle) and 123123 / 456456 (a 3-digit cycle).
  if (/^(\d\d)\1{2}$/.test(pin) || /^(\d\d\d)\1$/.test(pin)) {
    return "That PIN is too easy to guess. Avoid repeating patterns.";
  }

  return null;
}

/**
 * The withdrawal fee, to the minor unit.
 *
 * Mirrors create_withdrawal_request exactly — `round(amount * rate, 2)` — and
 * exists so the figure shown on /withdraw before confirming and the figure the
 * database actually charges come from one expression rather than two that
 * agree today. The one that moves money is still the SQL; this is what the
 * screen promises, and a drift between them is a customer being quoted a fee
 * they were not charged.
 */
export function withdrawalFee(amount: number, feeRate: number): number {
  return Math.round(amount * feeRate * 100) / 100;
}

/**
 * Whether a newly-changed payout destination is still inside the hold.
 *
 * The decision itself, as a pure function, so the rule can be tested without a
 * recipient row and a clock. Enforced for real in attemptAutomatedPayout and
 * again in Postgres (recipient_change_hold_active).
 */
export function recipientChangeHoldActive(
  recipientChangedAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!recipientChangedAt) return false;
  const changedAt = new Date(recipientChangedAt).getTime();
  if (!Number.isFinite(changedAt)) return false;
  return now - changedAt < RECIPIENT_CHANGE_HOLD_HOURS * 60 * 60 * 1000;
}

/**
 * Whether a withdrawal goes out automatically, and if not, what to tell the
 * customer.
 *
 * Pulled out of evaluateWithdrawalRouting as a pure function so the rule can
 * be read — and tested — without a database, a settings lookup and a live rate
 * probe standing in front of it.
 *
 * Two reasons to hold a withdrawal back, and only two. An unsupported corridor
 * is checked first because no amount of it is automatable; the single-request
 * limit second. The third reason — a payout destination changed inside
 * RECIPIENT_CHANGE_HOLD_HOURS — is recipientChangeHoldActive above, applied in
 * the payout path where the recipient row is in hand.
 *
 * There is deliberately NO rolling per-user total here: several small
 * withdrawals in one day are each judged on their own size.
 */
export function decideWithdrawalRouting(input: {
  /** False when this currency has no automated payout channel at all. */
  hasPayoutChannel: boolean;
  currency: string;
  thresholdUsd: number;
  /** USD-equivalent of this request alone. */
  requestUsd: number;
}): { automated: boolean; reason: string | null } {
  if (!input.hasPayoutChannel) {
    return {
      automated: false,
      reason: `Needs a quick review because ${input.currency} payouts aren't automated`,
    };
  }

  if (input.requestUsd > input.thresholdUsd) {
    return {
      automated: false,
      reason: `Needs a quick review because it's above ${input.thresholdUsd.toLocaleString("en-US")} USDT`,
    };
  }

  return { automated: true, reason: null };
}

/**
 * The shape of a payout destination, per corridor. Returns a message naming the
 * field, or null.
 *
 * WHY THIS EXISTS: the server only ever checked that these fields were
 * PRESENT, so a nine-digit account number or a truncated wallet address got as
 * far as the provider, and what came back was the provider's or Postgres'
 * own wording about a field the user had already moved on from. A wrong payout
 * destination is also the one mistake in this app with no recall, so saying
 * "that's not 10 digits" while the number is still on screen is worth more
 * here than anywhere else.
 *
 * DELIBERATELY NOT EXHAUSTIVE. Only rules that are certain are enforced:
 *
 *  - NGN account numbers are NUBAN, which is exactly 10 digits, always.
 *  - USDT on BSC is an EVM address: 0x and 40 hex characters, always.
 *  - KES is a Kenyan mobile number, checked loosely (a digit count, after an
 *    optional +254) because the local and international forms are both in
 *    everyday use and rejecting one of them would be worse than accepting a
 *    typo the provider will catch.
 *  - GHS account numbers vary in length by bank, so there is no length to
 *    check and none is invented. Presence only.
 *
 * Mirrored on both sides: the client calls it to say so before a round trip,
 * the server calls it because a client check is not a check.
 */
export function recipientFieldError(
  currency: string,
  fields: { bankAccountNumber?: string | null; walletAddress?: string | null },
): string | null {
  const account = (fields.bankAccountNumber ?? "").trim();
  const wallet = (fields.walletAddress ?? "").trim();

  if (currency === "NGN" && !/^\d{10}$/.test(account)) {
    return "A Nigerian account number is exactly 10 digits.";
  }

  if (currency === "USDT" && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return "That doesn't look like a BSC wallet address. It starts with 0x and has 40 characters after it.";
  }

  if (currency === "KES") {
    const digits = account.replace(/[\s-]/g, "").replace(/^\+?254/, "");
    if (!/^\d{9,10}$/.test(digits)) {
      return "Enter your M-Pesa number, for example 0712345678 or +254712345678.";
    }
  }

  return null;
}

/**
 * GROUP 2b. There is no USD payout rail — a dollar balance is converted out
 * before it can be sent anywhere. Not flag-gated like USD_WALLET_ENABLED
 * elsewhere: even once the wallet itself is live, withdrawing USD directly
 * still has nowhere to go, so this stays a standing fact rather than reading
 * from src/lib/services.ts.
 */
export function usdWithdrawalError(currency: string): string | null {
  if (currency !== "USD") return null;
  return "USD can't be withdrawn directly. Convert it first.";
}

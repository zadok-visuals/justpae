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

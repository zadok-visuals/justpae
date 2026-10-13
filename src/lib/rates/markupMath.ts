/**
 * The markup arithmetic, with no imports.
 *
 * Split out of markup.ts, which reaches for the service-role Supabase client at
 * module scope — importing that to check a multiplication pulls in a database
 * connection and a required set of environment variables. These three lines are
 * the part that decides what a customer is actually paid, and they are the part
 * most worth being able to test on their own.
 *
 * DIRECTION CONVENTION, used everywhere in this codebase without exception: a
 * rate is QUOTE units per 1 BASE unit. Every function here assumes it.
 */

/** Used when no row exists for a pair yet — 0.5%, the figure the operator confirmed. */
export const DEFAULT_MARKUP_RATE = 0.005;

/**
 * The customer rate: always the one that yields the customer LESS of the quote
 * currency, whichever way the pair runs.
 *
 * Since the rate is quote-per-base and the customer receives quote, reducing
 * the rate reduces what they receive. That is the whole mechanism, and it is
 * why this is `1 - markup` and never `1 + markup` — the latter would quote the
 * customer a BETTER rate than the provider gave us and pay the difference out
 * of our own pocket on every order.
 */
export function applyMarkupToRate(providerRate: number, markupRate: number): number {
  return providerRate * (1 - markupRate);
}

/** The same markup applied to a provider-delivered amount rather than a rate. */
export function applyMarkupToAmount(rawTargetAmount: number, markupRate: number): number {
  return rawTargetAmount * (1 - markupRate);
}

/**
 * The margin on one settled order, in the target currency.
 *
 * What the provider delivered minus what the customer was credited — the same
 * subtraction /admin/pnl reports, in one named place so the report and the
 * quote cannot drift apart.
 */
export function marginOnOrder(rawTargetAmount: number, creditedTargetAmount: number): number {
  return rawTargetAmount - creditedTargetAmount;
}

/** Money, to the minor unit. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

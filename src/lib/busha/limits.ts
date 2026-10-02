/**
 * Below this, Busha's own minimum rejects the request with a generic error
 * after the user has already submitted. Enforced client-side (disable submit,
 * explain why) AND server-side (can't be bypassed) in every conversion flow.
 *
 * No imports of its own, deliberately — safe to use from both Client
 * Components and server actions.
 */
export const MINIMUM_USDT_EQUIVALENT = 10;

/**
 * Busha support confirmed there is a minimum payout amount on their side too —
 * a withdrawal below it fails with the same generic "Request validation
 * failed". 5 USDT is the figure support suggested testing with, not an official
 * per-currency minimum from their docs; easy to raise if they specify one.
 *
 * Lives here (a plain leaf constant) rather than in automated-payout.ts, which
 * imports the service-role admin client at module scope and must never reach a
 * client bundle.
 */
export const MINIMUM_WITHDRAWAL_USDT_THRESHOLD = 5;

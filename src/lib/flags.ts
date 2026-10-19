/**
 * Feature flags, all DEFAULT OFF.
 *
 * Each one gates a path whose third-party provider is not yet confirmed for
 * this account. The rule throughout this codebase: when a provider is
 * unconfirmed, do NOT invent an API — build the full UI, schema and server
 * action, put the provider call behind an interface, and ship the flag off
 * with an honest "coming soon" state. Flipping the flag is then the only
 * change needed once credentials land.
 *
 * Read from NEXT_PUBLIC_* so a Client Component can render the right state
 * without a round trip. These say "is this feature switched on", never "here
 * is a secret" — every actual credential stays server-only.
 */

function flag(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/**
 * FEATURE 1 — USD receiving details on /receive.
 * Waiting on: confirmation of which provider will issue USD collection
 * (virtual USD account / ACH + wire details) on this account. No API is
 * guessed at; src/lib/providers/usdCollection.ts holds the interface.
 */
export const USD_COLLECTION_ENABLED = flag(process.env.NEXT_PUBLIC_FEATURE_USD_COLLECTION);

/**
 * FEATURE 2 — GHS deposits via Klasha.
 * Waiting on: Klasha account access (every live call has returned an
 * account-wide 403), the real request-body encryption scheme, and the webhook
 * signature scheme. Busha rejects GHS outright on this account ("Invalid
 * Currency GHS"), so GHS deposit has no other route. While off, GHS deposit
 * shows as unavailable rather than failing at submit.
 */
export const KLASHA_GHS_DEPOSIT_ENABLED = flag(process.env.NEXT_PUBLIC_FEATURE_KLASHA_GHS_DEPOSIT);

/**
 * FEATURE 5 — bills and airtime.
 * Waiting on: provider selection. The UI, schema and server actions are all
 * built; src/lib/providers/bills.ts holds the interface every candidate fits.
 * See the handoff notes for realistic options covering NG, GH and KE.
 */
export const BILLS_ENABLED = flag(process.env.NEXT_PUBLIC_FEATURE_BILLS);

/**
 * FEATURE 6 — flight booking.
 * Waiting on: provider verification. Ships OFF, like the rest.
 *
 * GROUP 4e CHANGED WHAT "OFF" MEANS FOR THIS ONE AND FOR BILLS.
 *
 * Until now an off flag meant the feature was HIDDEN: Bills disappeared from
 * the tab bar, the sidebar and Home's quick actions entirely. That was the
 * right call when the alternative was a tab leading to a dead end, but it
 * has a cost the brief now wants paid differently — a user cannot tell the
 * difference between "justpae does not do bills" and "justpae cannot do
 * bills this week". The first loses them permanently.
 *
 * So Bills and Flights are now VISIBLE while off, carrying a Maintenance
 * badge, with screens that explain themselves and take no provider call.
 * The flag still gates every provider call and every submit; it no longer
 * gates whether the feature is mentioned.
 */
export const FLIGHTS_ENABLED = flag(process.env.NEXT_PUBLIC_FEATURE_FLIGHTS);

export const FLAGS = {
  usdCollection: USD_COLLECTION_ENABLED,
  klashaGhsDeposit: KLASHA_GHS_DEPOSIT_ENABLED,
  bills: BILLS_ENABLED,
  flights: FLIGHTS_ENABLED,
} as const;

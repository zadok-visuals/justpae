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
 * FEATURE 2 — the whole GHS wallet, Klasha deposits included.
 * Waiting on: Klasha account access (every live call has returned an
 * account-wide 403), the real request-body encryption scheme, and the webhook
 * signature scheme. Busha rejects GHS outright on this account ("Invalid
 * Currency GHS"), so GHS deposit has no other route.
 *
 * GROUP 2. Renamed from the deposit-only KLASHA_GHS_DEPOSIT_ENABLED: the
 * wallet is locked as a whole now (deposit, convert, withdraw, Pay to China
 * funding), not just the one rail. One flag, one meaning, read from
 * src/lib/services.ts everywhere that needs to know whether GHS is usable.
 */
export const GHS_WALLET_ENABLED = flag(process.env.NEXT_PUBLIC_FEATURE_GHS_WALLET);

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

/**
 * FEATURE 7 — the USD wallet (deposit, convert, withdraw, Pay to China
 * funding). Off by default like every other flag here: a service only
 * becomes live when this is set explicitly, never by omission.
 */
export const USD_WALLET_ENABLED = flag(process.env.NEXT_PUBLIC_FEATURE_USD_WALLET);

/**
 * GROUP 7 — kill switches, not feature flags, and the one pair in this file
 * that reads backwards from every other export above.
 *
 * NGN and KES bank deposit (via Busha) are LIVE today, confirmed working —
 * unlike everything else here, which ships off until a provider is
 * confirmed. A flag following this file's usual "off by default" convention
 * would mean deploying it with NEXT_PUBLIC_MAINTENANCE_NGN_BANK_DEPOSIT
 * unset in Vercel — which is exactly the state production is in right now —
 * takes NGN deposits down the moment this ships. So these default to FALSE
 * MEANING "not in maintenance": unset or any value other than "true"/"1"
 * changes nothing, and ops sets it to "true" only to deliberately take one
 * rail down (a provider outage, say) without touching the other or the rest
 * of the NGN/KES wallet, which both stay fully usable either way — this
 * gates the deposit rail specifically, not the wallet (see
 * src/lib/services.ts for the wallet-level equivalent, GHS and USD).
 */
export const NGN_BANK_DEPOSIT_MAINTENANCE = flag(process.env.NEXT_PUBLIC_MAINTENANCE_NGN_BANK_DEPOSIT);
export const KES_BANK_DEPOSIT_MAINTENANCE = flag(process.env.NEXT_PUBLIC_MAINTENANCE_KES_BANK_DEPOSIT);

/**
 * GROUP 4, then revisited once Korapay's naira rail existed to replace it.
 * OFF BY DEFAULT now, back to this file's usual convention.
 *
 * The manual rail stays fully built — the customer flow, the admin settings
 * card and the admin Deposits queue are all exactly as they were — but it no
 * longer ships to customers by default while Korapay's permanent account
 * numbers are the intended naira path. Setting this to "true" turns the
 * manual flow back on for customers if Korapay ever needs a fallback again;
 * the admin queue stays reachable either way, since requests already in it
 * still need answering regardless of which rail is currently offered.
 */
export const NGN_MANUAL_DEPOSIT = flag(process.env.NEXT_PUBLIC_FEATURE_NGN_MANUAL_DEPOSIT);

/**
 * KORAPAY — three flags, all OFF by default, back to this file's original
 * convention after the three exports above that read backwards from it.
 *
 * NEXT_PUBLIC_ for the same reason every other flag here is: these say "is
 * this rail switched on", never "here is a secret". KORAPAY_SECRET_KEY stays
 * server-only and is read in exactly one place, src/lib/korapay/client.ts.
 *
 * WHY THESE ARE NOT IN src/lib/services.ts. SERVICES carries a customer-facing
 * `label` used by "Notify me" and by maintenance copy. A provider name is
 * never shown to a customer in this product — the naira rail is "your account
 * number", not the name of whoever issues it — so a SERVICES entry would
 * either carry a label that must never render, or leak the one word the copy
 * rules forbid. These gate which rail serves a currency; services.ts answers
 * whether that currency works at all, which is the customer's question.
 */

/**
 * Permanent virtual account numbers for naira deposits. When ON this REPLACES
 * the manual naira deposit for customers; NGN_MANUAL_DEPOSIT above stays the
 * fallback the moment this goes off, so there is never a window with no naira
 * deposit path at all. The admin manual-deposit queue is reachable either way,
 * because requests already in it still need answering.
 */
export const KORAPAY_NGN_DEPOSIT = flag(process.env.NEXT_PUBLIC_FEATURE_KORAPAY_NGN_DEPOSIT);

/**
 * Korapay as a payout route. This is the master switch; WHICH currencies
 * actually route through it is the per-currency admin setting (see
 * payoutRouteFor in src/lib/withdrawals/route.ts), and Busha remains the
 * default for every currency. Both have to agree before a payout leaves
 * through Korapay.
 */
export const KORAPAY_PAYOUTS = flag(process.env.NEXT_PUBLIC_FEATURE_KORAPAY_PAYOUTS);

/**
 * The daily automatic treasury sweep from the deposit balance to the payout
 * balance. Off by default and deliberately the most conservative of the
 * three: it is the only flag here that moves company money without a person
 * pressing anything.
 */
export const KORAPAY_AUTO_SWEEP = flag(process.env.NEXT_PUBLIC_FEATURE_KORAPAY_AUTO_SWEEP);

/**
 * GROUP 3 — Dojah BVN validation ahead of saving one. Off by default, same
 * convention as every flag above: a BVN save works exactly as it did before
 * until this is explicitly turned on, and turning it off again falls back to
 * saving unverified rather than refusing to save at all. See
 * src/lib/actions/kyc.ts and src/lib/dojah/client.ts.
 */
export const BVN_VALIDATION_ENABLED = flag(process.env.NEXT_PUBLIC_FEATURE_BVN_VALIDATION);

export const FLAGS = {
  usdWallet: USD_WALLET_ENABLED,
  korapayNgnDeposit: KORAPAY_NGN_DEPOSIT,
  korapayPayouts: KORAPAY_PAYOUTS,
  korapayAutoSweep: KORAPAY_AUTO_SWEEP,
  ngnManualDeposit: NGN_MANUAL_DEPOSIT,
  ghsWallet: GHS_WALLET_ENABLED,
  usdCollection: USD_COLLECTION_ENABLED,
  bills: BILLS_ENABLED,
  flights: FLIGHTS_ENABLED,
  ngnBankDepositMaintenance: NGN_BANK_DEPOSIT_MAINTENANCE,
  kesBankDepositMaintenance: KES_BANK_DEPOSIT_MAINTENANCE,
  bvnValidation: BVN_VALIDATION_ENABLED,
} as const;

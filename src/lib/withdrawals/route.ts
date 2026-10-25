// Relative, with extensions, for the same reason src/lib/deposits/availability.ts
// is: route.test.ts runs under `node --test` with no bundler and therefore no
// "@/" alias resolution. Everything reached from here is import-free (flags.ts)
// or type-only.
import type { Currency } from "../types/database.ts";
import { KORAPAY_PAYOUTS } from "../flags.ts";

/**
 * Which provider pays a given currency out.
 *
 * TWO THINGS HAVE TO AGREE, and the redundancy is the point. The flag
 * (NEXT_PUBLIC_FEATURE_KORAPAY_PAYOUTS) is the deploy-wide master switch an
 * engineer sets; the per-currency setting is the operational dial an admin
 * turns. Either one saying "no" means Busha, which is what makes the switch
 * reversible from two different places under pressure — an admin can move
 * naira back without a deploy, and a deploy can pull the whole rail without
 * waiting for an admin to be awake.
 *
 * BUSHA IS THE DEFAULT FOR EVERY CURRENCY and stays so when the setting is
 * missing, unparseable, or names a provider that cannot serve that currency.
 * An unreadable setting must never silently reroute live payouts.
 */
export type PayoutRoute = "busha" | "korapay";

/**
 * The only currencies Korapay can pay out on this account. GHS is absent
 * because the cedi wallet is locked as a whole (see src/lib/services.ts), and
 * USDT because Korapay has no crypto rail at all — both stay Busha's, and
 * listing them here would be a routing option that cannot work.
 */
export const KORAPAY_PAYOUT_CURRENCIES: Currency[] = ["NGN", "KES"];

export function isKorapayPayoutCurrency(currency: Currency): boolean {
  return KORAPAY_PAYOUT_CURRENCIES.includes(currency);
}

/** Normalises whatever string sits in app_settings. Anything else is Busha. */
export function parsePayoutRoute(value: string | null | undefined): PayoutRoute {
  return value?.trim().toLowerCase() === "korapay" ? "korapay" : "busha";
}

/**
 * Pure so it is testable without a database, and so the same decision can be
 * re-derived at the moment of payout rather than carried in a variable that
 * might be stale by then.
 *
 * `flagEnabled` is a parameter rather than read from the module constant so a
 * test can exercise both sides of it; production callers omit it.
 */
export function resolvePayoutRoute(
  currency: Currency,
  settingValue: string | null | undefined,
  flagEnabled: boolean = KORAPAY_PAYOUTS,
): PayoutRoute {
  if (!flagEnabled) return "busha";
  if (!isKorapayPayoutCurrency(currency)) return "busha";
  return parsePayoutRoute(settingValue);
}

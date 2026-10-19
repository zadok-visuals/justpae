import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import { probeFiatToUsdtRate } from "@/lib/busha/rate";
import type { CnyTier, CnyDirection } from "@/lib/cny/tiers";
import {
  priceCnyConversion,
  cnyRouteBlocker,
  cnyBlockerKind,
  indicativeCnyRate as indicativeRateFromTiers,
  type CnyPrice,
} from "@/lib/cny/priceCore";

export { cnyRouteBlocker, cnyBlockerKind };

/**
 * Server-only. What CNY costs, and what it is worth.
 *
 * THE SHAPE OF A CNY PRICE, in one place so nothing else has to know it:
 *
 *   live fiat -> USDT rate        from the provider; skipped for a USDT payer
 *   × the size band's CNY/USDT    from cny_tier_rates, resolved on the order
 *   × (1 - markup)                from cny_markup_rate, fiat or USDT column
 *
 * WHY THE BLEND HAPPENS HERE AND NOT IN POSTGRES. Step one is an HTTP call,
 * which Postgres cannot make. So the database holds the two configured parts
 * and this module does the arithmetic; the RESULT is then written to a quote
 * row that the settlement function reads, which is what keeps the "no figure
 * arrives from a caller" contract intact.
 *
 * WHAT IS IN THIS FILE AND WHAT IS NOT. The two impure steps are here: read
 * the ladder, ask the provider. The arithmetic between them lives in
 * priceCore.ts, which has no database and no network in it and is therefore
 * under unit test — a mis-resolved band or an inverted markup is a wrong
 * price on every order, and neither is visible by reading the form that
 * renders it.
 *
 * THE LADDER IS READ WITH THE SERVICE ROLE, always. cny_tier_rates has RLS on
 * and no read policy — a customer session genuinely cannot fetch it, which is
 * how "tiers price but never display" stops being a UI convention.
 *
 * MARKUP DIRECTION. The customer always gets the worse side: the markup is
 * applied to the amount they RECEIVE, never to the amount they pay. Buying
 * CNY, it reduces the yuan delivered; selling CNY, it reduces the naira or
 * USDT credited. Same rule, and the same helper, as every other rate in this
 * codebase (src/lib/rates/markupMath.ts).
 */

export interface CnyPricingConfig {
  tiers: CnyTier[];
  fiatMarkupRate: number;
  usdtMarkupRate: number;
}

/** Everything admin-configured about CNY, in one read. */
export async function loadCnyPricingConfig(): Promise<CnyPricingConfig> {
  const admin = createAdminClient();
  const [{ data: tierRows }, { data: markupRow }] = await Promise.all([
    admin.from("cny_tier_rates").select("*").order("tier_min_cny"),
    admin.from("cny_markup_rate").select("fiat_markup_rate, usdt_markup_rate").maybeSingle(),
  ]);

  return {
    tiers: (tierRows ?? []).map((row) => ({
      tierMinCny: Number(row.tier_min_cny),
      tierMaxCny: Number(row.tier_max_cny),
      usdtToCnyRate: Number(row.usdt_to_cny_rate),
    })),
    // Zero, not a guessed default, when the row is somehow missing. A wrong
    // markup is a wrong price on every order; no markup is a thin one. Only
    // the second is recoverable without refunding anybody.
    fiatMarkupRate: Number(markupRow?.fiat_markup_rate ?? 0),
    usdtMarkupRate: Number(markupRow?.usdt_markup_rate ?? 0),
  };
}

export function cnyMarkupFor(config: CnyPricingConfig, nonCnyCurrency: Currency): number {
  return nonCnyCurrency === "USDT" ? config.usdtMarkupRate : config.fiatMarkupRate;
}

export type CnyUnavailable = { available: false; reason: string };

/**
 * A priced CNY conversion. Every figure on it comes from priceCore, so the
 * quote a caller sees and the arithmetic under test cannot drift apart.
 */
export interface CnyQuote extends CnyPrice {
  available: true;
}

/**
 * Price one CNY conversion.
 *
 * `amountSide` says which field the user typed in, because the two are priced
 * by genuinely different resolutions of the ladder — see solveCnySpend's own
 * comment on the trap that distinction exists to avoid.
 */
export async function quoteCnyConversion(params: {
  direction: CnyDirection;
  nonCnyCurrency: Currency;
  amount: number;
  /** "source" = the amount being spent; "target" = the amount wanted. */
  amountSide: "source" | "target";
  config?: CnyPricingConfig;
}): Promise<CnyQuote | CnyUnavailable> {
  const { direction, nonCnyCurrency, amount, amountSide } = params;

  const blocker = cnyRouteBlocker(nonCnyCurrency);
  if (blocker) return { available: false, reason: blocker };

  if (!Number.isFinite(amount) || amount <= 0) {
    return { available: false, reason: "Enter a valid amount." };
  }

  const config = params.config ?? (await loadCnyPricingConfig());
  if (config.tiers.length === 0) {
    return { available: false, reason: "Yuan pricing isn't configured yet. Please try again later." };
  }

  // The fiat leg. A USDT payer has none — their amount already IS the USDT
  // equivalent — so no provider call is made at all, which also means a
  // provider outage cannot block a USDT-to-CNY conversion.
  let providerRate: number | null = null;
  if (nonCnyCurrency !== "USDT") {
    try {
      providerRate = await probeFiatToUsdtRate(nonCnyCurrency);
    } catch {
      return {
        available: false,
        reason: `We couldn't get a live ${nonCnyCurrency} rate just now. Please try again in a moment.`,
      };
    }
    if (!providerRate || providerRate <= 0) {
      return {
        available: false,
        reason: `We couldn't get a live ${nonCnyCurrency} rate just now. Please try again in a moment.`,
      };
    }
  }

  // Everything impure is now behind us: the ladder is loaded and the live
  // rate is in hand. The arithmetic is priceCore's, under unit test.
  const price = priceCnyConversion({
    direction,
    nonCnyCurrency,
    amount,
    amountSide,
    providerRate,
    tiers: config.tiers,
    markupRate: cnyMarkupFor(config, nonCnyCurrency),
  });

  if (!price) {
    return { available: false, reason: "Yuan pricing isn't configured yet. Please try again later." };
  }

  return { available: true, ...price };
}

/**
 * An indicative rate for a CNY pair with no amount in hand.
 *
 * Used ONLY for availability and for a minimum estimate — never shown as a
 * price, because a tiered rate without an amount is not a price. It
 * deliberately takes the LOWEST band, which is the worst rate a buyer can
 * get: an indicative figure that errs against the customer cannot become a
 * promise we then fail to honour.
 */
export function indicativeCnyRate(config: CnyPricingConfig): number | null {
  return indicativeRateFromTiers(config.tiers);
}

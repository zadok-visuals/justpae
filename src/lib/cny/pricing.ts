import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import { probeFiatToUsdtRate } from "@/lib/busha/rate";
import { applyMarkupToAmount } from "@/lib/rates/markupMath";
import { isUsdPair } from "@/lib/currencies";
import {
  computeCnyAmounts,
  solveCnySpend,
  lowestTier,
  round2,
  type CnyTier,
  type CnyDirection,
} from "@/lib/cny/tiers";

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

export interface CnyQuote {
  available: true;
  direction: CnyDirection;
  nonCnyCurrency: Currency;
  /** What leaves the user's wallet. */
  sourceCurrency: Currency;
  sourceAmount: number;
  /** What lands, after markup. */
  targetCurrency: Currency;
  targetAmount: number;
  /** Before markup — the margin is the gap, and /admin/pnl reports it. */
  rawTargetAmount: number;
  /** USDT per 1 unit of the non-CNY currency. Null for a USDT payer. */
  providerRate: number | null;
  /** CNY per 1 USDT — the band that applied. */
  tierRate: number;
  markupRate: number;
  /** Target per 1 source, after markup. The one figure a receipt can check. */
  customerRate: number;
  /** USDT-equivalent of one source unit, for the minimum gate. */
  sourceUsdtRate: number;
}

/**
 * Why a CNY route might not be priceable at all, checked before any provider
 * call so the answer costs nothing when it is "no".
 */
export function cnyRouteBlocker(nonCnyCurrency: Currency): string | null {
  if (nonCnyCurrency === "CNY") return "Pick two different wallets.";
  if (isUsdPair(nonCnyCurrency, "CNY")) {
    // USD has no leg anywhere on this account (see USD_CONVERSION_UNAVAILABLE)
    // and CNY pricing needs the USDT leg to exist. Caught here so the user is
    // told the standing reason rather than a generic pricing failure.
    return "Dollar conversions aren't open yet, so dollars can't be converted to yuan either.";
  }
  if (nonCnyCurrency === "GHS") {
    return "Cedi conversions are under maintenance. We'll let you know the moment they're back.";
  }
  return null;
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

  const markupRate = cnyMarkupFor(config, nonCnyCurrency);

  // ── Resolve the pre-markup amounts ───────────────────────────────────────
  //
  // Four combinations of (direction, which field was typed), and the ladder
  // is resolved differently for each. The rule: resolve the band off whatever
  // CNY figure is actually KNOWN, and fall back to the forward walk only when
  // the CNY side is the unknown one.
  let amounts: { cnyAmount: number; nonCnyAmount: number; tierRate: number } | null;

  if (direction === "to_cny") {
    amounts =
      amountSide === "source"
        ? computeCnyAmounts("to_cny", amount, providerRate, config.tiers)
        : // They typed the yuan they want the recipient to have. That figure
          // is in CNY already, so the band comes from it directly.
          solveCnySpend(amount, providerRate, config.tiers);
  } else {
    if (amountSide === "source") {
      amounts = computeCnyAmounts("from_cny", amount, providerRate, config.tiers);
    } else {
      // Spending CNY, but they typed how much non-CNY they want out. Convert
      // that back to USDT and then to the CNY it would cost — and because
      // that CNY figure is derived rather than given, the band has to be
      // found by the forward walk on the USDT equivalent.
      const usdtWanted = providerRate != null ? amount * providerRate : amount;
      const forward = computeCnyAmounts("to_cny", usdtWanted, null, config.tiers);
      amounts = forward
        ? { cnyAmount: forward.cnyAmount, nonCnyAmount: round2(amount), tierRate: forward.tierRate }
        : null;
    }
  }

  if (!amounts) {
    return { available: false, reason: "Yuan pricing isn't configured yet. Please try again later." };
  }

  const sourceCurrency: Currency = direction === "to_cny" ? nonCnyCurrency : "CNY";
  const targetCurrency: Currency = direction === "to_cny" ? "CNY" : nonCnyCurrency;
  const sourceAmount = round2(
    direction === "to_cny" ? amounts.nonCnyAmount : amounts.cnyAmount,
  );
  const rawTargetAmount = round2(
    direction === "to_cny" ? amounts.cnyAmount : amounts.nonCnyAmount,
  );
  const targetAmount = round2(applyMarkupToAmount(rawTargetAmount, markupRate));

  return {
    available: true,
    direction,
    nonCnyCurrency,
    sourceCurrency,
    sourceAmount,
    targetCurrency,
    targetAmount,
    rawTargetAmount,
    providerRate,
    tierRate: amounts.tierRate,
    markupRate,
    customerRate: sourceAmount > 0 ? targetAmount / sourceAmount : 0,
    sourceUsdtRate:
      direction === "to_cny"
        ? (providerRate ?? 1)
        : // One CNY is worth 1/tierRate USDT. Used only for the minimum gate.
          1 / amounts.tierRate,
  };
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
  return lowestTier(config.tiers)?.usdtToCnyRate ?? null;
}

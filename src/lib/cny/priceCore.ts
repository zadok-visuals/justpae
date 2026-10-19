import type { Currency } from "@/lib/types/database";
// Relative, with extensions: this module is covered by priceCore.test.ts,
// which runs under `node --test` with no bundler and therefore no "@/" alias
// resolution. Every module reached from here is import-free or type-only for
// the same reason. tsconfig's allowImportingTsExtensions is what lets the
// app's own build read the same specifiers.
import {
  computeCnyAmounts,
  solveCnySpend,
  lowestTier,
  round2,
  type CnyTier,
  type CnyDirection,
} from "./tiers.ts";
import { applyMarkupToAmount } from "../rates/markupMath.ts";
import { isUsdPair } from "../currencies.ts";
import type { UnavailableKind } from "../ui/unavailability.ts";

/**
 * CNY pricing with everything impure taken out.
 *
 * pricing.ts does two things this module cannot: it reads the admin-configured
 * ladder out of Postgres, and it asks the provider for a live fiat rate. Both
 * are I/O, and both are the reason the arithmetic between them went untested
 * while it was all one function.
 *
 * So the split is at the point where both answers are already in hand. Give
 * this module a ladder, a markup and a provider rate and it will tell you
 * exactly what the order prices at — with no network, no database, and
 * therefore a test that can assert the actual numbers.
 *
 * THE SHAPE OF A CNY PRICE, unchanged by the extraction:
 *
 *   live fiat -> USDT rate        from the provider; absent for a USDT payer
 *   × the size band's CNY/USDT    from the ladder, resolved on the order
 *   × (1 - markup)                fiat or USDT column
 *
 * MARKUP DIRECTION. The customer always gets the worse side: it is applied to
 * the amount they RECEIVE, never to the amount they pay. Buying yuan it
 * reduces the yuan delivered; selling yuan it reduces the naira or USDT
 * credited. Same rule and same helper as every other rate in this codebase.
 */

export interface CnyPriceInput {
  direction: CnyDirection;
  nonCnyCurrency: Currency;
  amount: number;
  /** "source" = the amount being spent; "target" = the amount wanted. */
  amountSide: "source" | "target";
  /** USDT per 1 unit of nonCnyCurrency. Null for a USDT payer, who has no fiat leg. */
  providerRate: number | null;
  tiers: CnyTier[];
  markupRate: number;
}

export interface CnyPrice {
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
 * Why a CNY route might not be priceable at all.
 *
 * Checked before any provider call, so the answer costs nothing when it is
 * "no" — and pure, so the reasons a customer can be shown are under test.
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
 * GROUP 4f — WHICH of the things cnyRouteBlocker just refused for, as one of
 * the shared one-word states.
 *
 * It lives beside cnyRouteBlocker and mirrors its branches rather than
 * parsing its sentence, so rewording a refusal cannot silently change the
 * badge beside it. Three callers read the pair together — /convert's picker,
 * /pay-to-china and the account action row — and all three have to agree.
 *
 * The distinction that matters: cedi conversions are DOWN and coming back,
 * while dollars have no leg anywhere on this account at all. One word each,
 * and not the same word.
 */
export function cnyBlockerKind(nonCnyCurrency: Currency): UnavailableKind {
  if (nonCnyCurrency === "CNY") return "same";
  if (nonCnyCurrency === "GHS") return "maintenance";
  return "unsupported";
}

/**
 * Price one CNY conversion, given a ladder and a provider rate.
 *
 * Returns null only when the ladder cannot resolve a band for the order —
 * the caller turns that into "pricing isn't configured yet", because it is
 * never the customer's fault and never worth a figure guessed from thin air.
 */
export function priceCnyConversion(input: CnyPriceInput): CnyPrice | null {
  const { direction, nonCnyCurrency, amount, amountSide, providerRate, tiers, markupRate } = input;

  if (tiers.length === 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;

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
        ? computeCnyAmounts("to_cny", amount, providerRate, tiers)
        : // They typed the yuan they want the recipient to have. That figure
          // is in CNY already, so the band comes from it directly.
          solveCnySpend(amount, providerRate, tiers);
  } else {
    if (amountSide === "source") {
      amounts = computeCnyAmounts("from_cny", amount, providerRate, tiers);
    } else {
      // Spending CNY, but they typed how much non-CNY they want out. Convert
      // that back to USDT and then to the CNY it would cost — and because
      // that CNY figure is derived rather than given, the band has to be
      // found by the forward walk on the USDT equivalent.
      const usdtWanted = providerRate != null ? amount * providerRate : amount;
      const forward = computeCnyAmounts("to_cny", usdtWanted, null, tiers);
      amounts = forward
        ? { cnyAmount: forward.cnyAmount, nonCnyAmount: round2(amount), tierRate: forward.tierRate }
        : null;
    }
  }

  if (!amounts) return null;

  const sourceCurrency: Currency = direction === "to_cny" ? nonCnyCurrency : "CNY";
  const targetCurrency: Currency = direction === "to_cny" ? "CNY" : nonCnyCurrency;
  const sourceAmount = round2(direction === "to_cny" ? amounts.nonCnyAmount : amounts.cnyAmount);
  const rawTargetAmount = round2(direction === "to_cny" ? amounts.cnyAmount : amounts.nonCnyAmount);
  const targetAmount = round2(applyMarkupToAmount(rawTargetAmount, markupRate));

  return {
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
export function indicativeCnyRate(tiers: CnyTier[]): number | null {
  return lowestTier(tiers)?.usdtToCnyRate ?? null;
}

/**
 * The CNY size ladder, as arithmetic. No imports, no I/O.
 *
 * WHY CNY IS PRICED DIFFERENTLY FROM EVERYTHING ELSE
 *
 * Every other currency in this app is priced by asking a provider what a pair
 * costs right now. No provider quotes CNY for this business at all — a CNY
 * balance is an internal obligation, not a holding (see src/lib/currencies.ts)
 * — so its price is something this business sets, and it sets it in two parts:
 *
 *   1. the live fiat -> USDT rate from the provider, for the leg that IS
 *      quotable (skipped entirely when the customer is paying in USDT);
 *   2. an internal USDT -> CNY rate that depends on SIZE, because a bigger
 *      order genuinely buys yuan from the supplier at a better rate.
 *
 * Part 2 is the ladder, and it is why this file exists as pure functions: the
 * resolution is the one part of CNY pricing that is subtle enough to get
 * wrong silently, and it is the part a test can pin down without a database
 * or a provider.
 *
 * THE LADDER IS NEVER SHOWN TO A CUSTOMER. It prices; it does not display.
 * cny_tier_rates has RLS on and no read policy, so a customer session cannot
 * fetch it even if a future component asks — see migration 0026.
 *
 * DIRECTION CONVENTION, as everywhere in this codebase: a rate is QUOTE units
 * per 1 BASE unit. `usdt_to_cny_rate` is CNY per 1 USDT.
 */

export interface CnyTier {
  tierMinCny: number;
  tierMaxCny: number;
  /** CNY per 1 USDT. */
  usdtToCnyRate: number;
}

export type CnyDirection = "to_cny" | "from_cny";

function sorted(tiers: CnyTier[]): CnyTier[] {
  return [...tiers].sort((a, b) => a.tierMinCny - b.tierMinCny);
}

/**
 * REVERSE (CNY -> something else): trivial, because the CNY figure is the
 * input. The band it falls into is the band that applies.
 *
 * An amount above every band's ceiling takes the top band rather than failing:
 * the ladder's top row is a floor on how good the rate gets, not a limit on
 * order size.
 */
export function resolveReverseTier(cnyAmount: number, tiers: CnyTier[]): CnyTier | null {
  const list = sorted(tiers);
  if (list.length === 0) return null;
  return (
    list.find((t) => cnyAmount >= t.tierMinCny && cnyAmount <= t.tierMaxCny) ??
    list[list.length - 1]
  );
}

/**
 * FORWARD (something else -> CNY): the hard direction, because the CNY amount
 * that decides the band is the OUTPUT of the rate being chosen. A naive
 * implementation picks a band, computes an amount that falls outside it, and
 * either uses the wrong rate or loops.
 *
 * The resolution walks UP the ladder: price the order with the current band's
 * rate, and if the result overshoots that band's ceiling, the order is really
 * a bigger one — move up and re-check.
 *
 * THIS CANNOT OSCILLATE, and the reason is worth stating because it is the
 * only thing standing between this loop and a hang: a higher band's rate is
 * never worse, so escalating can only ever produce a LARGER CNY figure. A
 * threshold crossed on the way up is never un-crossed. The loop is bounded by
 * the number of bands regardless.
 */
export function resolveForwardTier(usdtEquivalent: number, tiers: CnyTier[]): CnyTier | null {
  const list = sorted(tiers);
  if (list.length === 0) return null;

  for (let i = 0; i < list.length; i += 1) {
    const tier = list[i];
    const estimate = usdtEquivalent * tier.usdtToCnyRate;
    if (estimate <= tier.tierMaxCny || i === list.length - 1) return tier;
  }

  return list[list.length - 1];
}

/** The cheapest band, used where a rate is needed before an amount exists. */
export function lowestTier(tiers: CnyTier[]): CnyTier | null {
  return sorted(tiers)[0] ?? null;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface CnyAmounts {
  cnyAmount: number;
  nonCnyAmount: number;
  /** CNY per 1 USDT, the band that applied. */
  tierRate: number;
}

/**
 * The whole conversion, both directions, pre-markup.
 *
 * ONE implementation, shared by the live preview the browser renders on every
 * keystroke and by the server path that independently recomputes at commit
 * time. Two implementations is how a preview drifts from a settlement, and
 * the drift only ever shows up as a customer complaint.
 *
 * `usdtPerNonCnyUnit` is USDT per 1 unit of the non-CNY currency — the
 * provider's own orientation, and null when the non-CNY side IS USDT and
 * there is no fiat leg at all.
 *
 * `amount` is in whichever currency the user typed into:
 *   to_cny    the non-CNY amount being spent
 *   from_cny  the CNY amount being spent
 */
export function computeCnyAmounts(
  direction: CnyDirection,
  amount: number,
  usdtPerNonCnyUnit: number | null,
  tiers: CnyTier[],
): CnyAmounts | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (direction === "to_cny") {
    const usdtEquivalent = usdtPerNonCnyUnit != null ? amount * usdtPerNonCnyUnit : amount;
    const tier = resolveForwardTier(usdtEquivalent, tiers);
    if (!tier) return null;
    return {
      cnyAmount: round2(usdtEquivalent * tier.usdtToCnyRate),
      nonCnyAmount: amount,
      tierRate: tier.usdtToCnyRate,
    };
  }

  const tier = resolveReverseTier(amount, tiers);
  if (!tier) return null;
  const usdtEquivalent = amount / tier.usdtToCnyRate;
  const nonCnyAmount =
    usdtPerNonCnyUnit != null ? usdtEquivalent / usdtPerNonCnyUnit : usdtEquivalent;
  return {
    cnyAmount: amount,
    nonCnyAmount: round2(nonCnyAmount),
    tierRate: tier.usdtToCnyRate,
  };
}

/**
 * The same conversion run BACKWARDS from the amount the user wants to end up
 * with, for the "they receive" field.
 *
 * Only the forward direction needs this: going to_cny, typing a CNY target
 * means solving for the non-CNY spend, and the band depends on the CNY figure
 * — which is known, so the reverse resolver is the right one to use even
 * though the conversion itself is forward. Getting that backwards (using the
 * forward resolver on a number that is already in CNY) picks the band by an
 * amount measured in the wrong unit.
 */
export function solveCnySpend(
  targetCny: number,
  usdtPerNonCnyUnit: number | null,
  tiers: CnyTier[],
): CnyAmounts | null {
  if (!Number.isFinite(targetCny) || targetCny <= 0) return null;

  const tier = resolveReverseTier(targetCny, tiers);
  if (!tier) return null;

  const usdtEquivalent = targetCny / tier.usdtToCnyRate;
  const nonCnyAmount =
    usdtPerNonCnyUnit != null ? usdtEquivalent / usdtPerNonCnyUnit : usdtEquivalent;

  return {
    cnyAmount: round2(targetCny),
    nonCnyAmount: round2(nonCnyAmount),
    tierRate: tier.usdtToCnyRate,
  };
}

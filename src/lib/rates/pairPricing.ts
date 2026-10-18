/**
 * Turning a route's rate into the two numbers a customer actually asks for.
 *
 * "What's the rate?" is never one number. Someone holding naira wants to know
 * what a dollar of USDT costs them; someone holding USDT wants to know what
 * they'd get for it. Those are different figures on the provider's side — a
 * real bid/ask spread, confirmed live on this account (USDT/NGN buy 1380.72,
 * sell 1364.26) — and showing one of them labelled "rate" leaves half the
 * readers with the wrong number.
 *
 * So both are shown, always in the same orientation a market quotes them in:
 * LOCAL CURRENCY PER 1 USDT, for both sides.
 *
 * WHY THESE ARE PURE FUNCTIONS WITH NO IMPORTS
 *
 * Same reason markupMath.ts exists next door: deciding what a customer is told
 * they'll pay is the part most worth testing on its own, and resolving a route
 * reaches for both the provider and the service-role Supabase client. The
 * arithmetic lives here; src/lib/rates/display.ts does the resolving.
 *
 * THE MARKUP IS ALREADY IN THE RATES THESE TAKE.
 *
 * Every figure here is derived from a route's `customerRate`, which routes.ts
 * has already run through quoteWithMarkup. Nothing in this file applies a
 * markup, and nothing in this file should ever start to — one markup
 * calculation, in src/lib/rates/markup.ts, is the whole point of that module.
 */

/**
 * What the customer PAYS, per 1 USDT, in their local currency.
 *
 * A fiat -> USDT route's customerRate is USDT per 1 unit of fiat (quote per
 * base, like every rate in this codebase), so the price per USDT is its
 * reciprocal. The markup has already made that rate SMALLER — fewer USDT per
 * naira — which makes the reciprocal BIGGER. The customer paying more per USDT
 * is exactly the right direction, and it falls out of the inversion rather
 * than being applied again here.
 */
export function buyPriceFromFiatToUsdtRate(usdtPerFiat: number): number | null {
  if (!Number.isFinite(usdtPerFiat) || usdtPerFiat <= 0) return null;
  return 1 / usdtPerFiat;
}

/**
 * What the customer RECEIVES, per 1 USDT, in their local currency.
 *
 * A USDT -> fiat route's customerRate is already fiat per 1 USDT, so this is
 * the identity — named anyway, so that a reader of display.ts can see the two
 * sides being derived side by side and check that only one of them inverts.
 */
export function sellPriceFromUsdtToFiatRate(fiatPerUsdt: number): number | null {
  if (!Number.isFinite(fiatPerUsdt) || fiatPerUsdt <= 0) return null;
  return fiatPerUsdt;
}

/**
 * The two provider leg prices behind a bridged fiat -> fiat conversion.
 *
 * A fiat-to-fiat route is priced, and since Group 4a executed, as two legs
 * through USDT. routes.ts already carries everything needed to recover them:
 *
 *   sourceUsdtRate  USDT per 1 source fiat  -> invert for the source buy price
 *   providerRate    target per 1 source     -> divide out the first leg to get
 *                                              target fiat per 1 USDT
 *
 * Both come back PRE-markup, and that is deliberate rather than an oversight.
 * A bridged route carries ONE markup for the (from, to) pair — see the comment
 * on executeBridgedConversion about why applying it per leg would charge the
 * customer twice for one conversion. So the honest presentation is the two raw
 * leg prices alongside the single spread and the composite rate that the
 * conversion actually settles at, which reconcile exactly:
 *
 *   (1 / buyPrice) * sellPrice * (1 - spread) === customerRate
 *
 * Splitting the markup across the legs to make each one look "customer
 * facing" would invent a second markup calculation and produce two figures
 * that multiply out to the right answer only by construction. These are the
 * rates actually used.
 */
export function bridgeLegPrices(route: {
  sourceUsdtRate: number;
  providerRate: number;
}): { buyPrice: number; sellPrice: number } | null {
  const { sourceUsdtRate, providerRate } = route;
  if (!Number.isFinite(sourceUsdtRate) || sourceUsdtRate <= 0) return null;
  if (!Number.isFinite(providerRate) || providerRate <= 0) return null;
  return {
    buyPrice: 1 / sourceUsdtRate,
    sellPrice: providerRate / sourceUsdtRate,
  };
}

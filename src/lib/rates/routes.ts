import type { Currency } from "@/lib/types/database";
import { getUsdtPairRates } from "@/lib/busha/rate";
import { quoteWithMarkup, type MarkupQuote } from "@/lib/rates/markup";

/**
 * Server-only. Conversion route resolution for /convert.
 *
 * Three shapes of route exist:
 *
 *   1. fiat -> USDT   — the provider's BUY price for that pair (fiat per 1
 *                       USDT), inverted so the rate stays quote-per-base.
 *   2. USDT -> fiat   — the provider's SELL price for that pair, used as-is.
 *   3. fiat -> fiat   — no direct pair exists on the provider for any of our
 *                       fiat pairings, so USDT is the bridge: sell the source
 *                       fiat into USDT at its buy price, then buy the target
 *                       fiat out of USDT at its sell price. USD -> local goes
 *                       through exactly this path.
 *
 * A pair the provider simply doesn't offer is not an error to discover at
 * submit time. getUsdtPairRates returns null for those (confirmed live: GHS has
 * no USDT pair on this account today), and this module surfaces that as an
 * `unavailable` route with a specific reason, so /convert can disable the
 * route in the UI and explain why instead of failing after the user commits.
 */

export type RouteKind = "fiat_to_usdt" | "usdt_to_fiat" | "fiat_via_usdt";

export type ConversionRoute =
  | {
      available: true;
      kind: RouteKind;
      from: Currency;
      to: Currency;
      /** Quote units per 1 base unit, pre-markup. */
      providerRate: number;
      markupRate: number;
      /** What the customer is shown and settled at. */
      customerRate: number;
      /** The USDT-equivalent of 1 unit of `from`, for minimum enforcement. */
      sourceUsdtRate: number;
    }
  | {
      available: false;
      from: Currency;
      to: Currency;
      reason: string;
    };

function unavailable(from: Currency, to: Currency, reason: string): ConversionRoute {
  return { available: false, from, to, reason };
}

/**
 * Resolves the live route for a pair. Always called server-side at quote time
 * AND again at execution time — the server never trusts a client-supplied rate.
 */
export async function resolveRoute(from: Currency, to: Currency): Promise<ConversionRoute> {
  if (from === to) {
    return unavailable(from, to, "Pick two different wallets.");
  }

  // ── USDT on one side: a single direct pair lookup. ──────────────────────
  if (from === "USDT" || to === "USDT") {
    const fiat = from === "USDT" ? to : from;
    const pair = await getUsdtPairRates(fiat);
    if (!pair) {
      return unavailable(
        from,
        to,
        `USDT/${fiat} isn't quoted by our liquidity provider yet, so this route is unavailable. Convert via another wallet in the meantime.`,
      );
    }

    if (from === "USDT") {
      // USDT -> fiat: sellRate is already fiat per 1 USDT.
      const marked = await quoteWithMarkup(from, to, pair.sellRate);
      return directRoute("usdt_to_fiat", from, to, marked, 1);
    }

    // fiat -> USDT: buyRate is fiat per 1 USDT, so invert for USDT per 1 fiat.
    const providerRate = 1 / pair.buyRate;
    const marked = await quoteWithMarkup(from, to, providerRate);
    return directRoute("fiat_to_usdt", from, to, marked, providerRate);
  }

  // ── fiat -> fiat: bridge through USDT. ─────────────────────────────────
  const [fromPair, toPair] = await Promise.all([getUsdtPairRates(from), getUsdtPairRates(to)]);

  if (!fromPair) {
    return unavailable(
      from,
      to,
      `USDT/${from} isn't quoted by our liquidity provider yet, so ${from} can't be converted at the moment.`,
    );
  }
  if (!toPair) {
    return unavailable(
      from,
      to,
      `USDT/${to} isn't quoted by our liquidity provider yet, so ${to} can't be converted at the moment.`,
    );
  }

  // 1 `from` buys (1 / fromPair.buyRate) USDT; each USDT sells for
  // toPair.sellRate of `to`.
  const sourceUsdtRate = 1 / fromPair.buyRate;
  const providerRate = sourceUsdtRate * toPair.sellRate;
  const marked = await quoteWithMarkup(from, to, providerRate);
  return directRoute("fiat_via_usdt", from, to, marked, sourceUsdtRate);
}

function directRoute(
  kind: RouteKind,
  from: Currency,
  to: Currency,
  marked: MarkupQuote,
  sourceUsdtRate: number,
): ConversionRoute {
  return {
    available: true,
    kind,
    from,
    to,
    providerRate: marked.providerRate,
    markupRate: marked.markupRate,
    customerRate: marked.customerRate,
    sourceUsdtRate,
  };
}

/**
 * Resolves every route out of one wallet at once, so /convert can grey out the
 * destinations that aren't quotable before the user picks one rather than after.
 */
export async function resolveRoutesFrom(
  from: Currency,
  candidates: Currency[],
): Promise<ConversionRoute[]> {
  return Promise.all(candidates.filter((c) => c !== from).map((to) => resolveRoute(from, to)));
}

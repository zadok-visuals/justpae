import type { Currency } from "@/lib/types/database";
import type { UnavailableKind } from "@/lib/ui/unavailability";
import { getUsdtPairRates } from "@/lib/busha/rate";
import { quoteWithMarkup, type MarkupQuote } from "@/lib/rates/markup";
import { applyMarkupToRate } from "@/lib/rates/markupMath";
import { isUsdPair, USD_CONVERSION_UNAVAILABLE } from "@/lib/currencies";
import {
  cnyRouteBlocker,
  cnyBlockerKind,
  cnyMarkupFor,
  indicativeCnyRate,
  loadCnyPricingConfig,
} from "@/lib/cny/pricing";

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
 *   4. CNY on either  — not a provider route at all. No provider quotes CNY
 *      side              for this business; the price is set internally from
 *                       a size ladder plus the live USDT leg. This module
 *                       reports AVAILABILITY for those pairs and nothing
 *                       else: a tiered rate without an amount is not a price,
 *                       so the real figure comes from quoteCnyConversion,
 *                       which has the amount. See src/lib/cny/pricing.ts.
 *
 * A pair the provider simply doesn't offer is not an error to discover at
 * submit time. getUsdtPairRates returns null for those (confirmed live: GHS has
 * no USDT pair on this account today), and this module surfaces that as an
 * `unavailable` route with a specific reason, so /convert can disable the
 * route in the UI and explain why instead of failing after the user commits.
 */

export type RouteKind = "fiat_to_usdt" | "usdt_to_fiat" | "fiat_via_usdt" | "cny_ledger";

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
      /**
       * GROUP 4f. The one-word form of `reason`, for the `<option>` in
       * /convert's wallet pickers — which had room for exactly one word and
       * was spending it on "unavailable".
       *
       * Named `unavailableKind` rather than `kind` on purpose: the AVAILABLE
       * branch already has a `kind` (RouteKind, how the conversion is
       * plumbed), and two differently-meaning `kind`s on one union is how a
       * reader ends up reading the wrong one.
       */
      unavailableKind: UnavailableKind;
    };

function unavailable(
  from: Currency,
  to: Currency,
  reason: string,
  unavailableKind: UnavailableKind,
): ConversionRoute {
  return { available: false, from, to, reason, unavailableKind };
}

/**
 * GROUP 9a — WHERE A ROUTE'S INPUTS COME FROM.
 *
 * `"live"` goes straight to the provider and to Postgres. `"cached"` reads
 * the 30-second shared display cache (src/lib/rates/cache.ts).
 *
 * THE DEFAULT IS "live", AND THAT IS THE WHOLE SAFETY MECHANISM. Every caller
 * that forgets to think about this gets a fresh rate, which is slower and
 * correct. Only two callers opt into the cache, both of which exist to
 * ADVERTISE a price rather than settle at one: resolveRateBoard and
 * listRoutesFrom. A commit path cannot become stale by omission — it would
 * have to be edited to say `"cached"`, in a module that
 * src/lib/rates/cache.test.ts asserts does not reach the cache at all.
 */
export type RateSource = "live" | "cached";

/**
 * The cache is reached through a DYNAMIC import, which is not a style choice.
 *
 * A static `import { cachedUsdtPairRates }` here would put next/cache into
 * the module graph of every commit path that imports this file, and the
 * "commit paths never touch the cache" rule would then be a convention
 * enforced by reading comments. With the import inside the `"cached"` branch,
 * a commit path's graph genuinely does not contain it, and the assertion in
 * cache.test.ts is checking a real property.
 */
async function pairRates(fiatCurrency: string, source: RateSource) {
  if (source === "cached") {
    const { cachedUsdtPairRates } = await import("@/lib/rates/cache");
    return cachedUsdtPairRates(fiatCurrency);
  }
  return getUsdtPairRates(fiatCurrency);
}

async function markedRate(
  base: Currency,
  quote: Currency,
  providerRate: number,
  source: RateSource,
): Promise<MarkupQuote> {
  if (source === "cached") {
    const { cachedMarkupRate } = await import("@/lib/rates/cache");
    const markupRate = await cachedMarkupRate(base, quote);
    return {
      providerRate,
      markupRate,
      customerRate: applyMarkupToRate(providerRate, markupRate),
    };
  }
  return quoteWithMarkup(base, quote, providerRate);
}

/**
 * Resolves the route for a pair. Always called server-side at quote time AND
 * again at execution time — the server never trusts a client-supplied rate,
 * and with `source` left at its default it never trusts a cached one either.
 */
export async function resolveRoute(
  from: Currency,
  to: Currency,
  source: RateSource = "live",
): Promise<ConversionRoute> {
  if (from === to) {
    return unavailable(from, to, "Pick two different wallets.", "same");
  }

  // ── USD: refused HERE, before any provider call. ────────────────────────
  //
  // There is no USDT/USD pair on this account, so every USD route — direct to
  // USDT, or bridged to a local currency — resolves to nothing. Left to the
  // lookups below, that arrives as the generic "USDT/USD isn't quoted by our
  // liquidity provider yet" line, which reads as a passing outage rather than
  // the standing fact it is, and only after a wasted round trip per pair.
  //
  // One short-circuit covers every caller: quoteConversion, executeConversion,
  // listRoutesFrom (so the select is disabled with the real reason before the
  // user picks it) and Home's rate strip all route through here.
  if (isUsdPair(from, to)) {
    return unavailable(from, to, USD_CONVERSION_UNAVAILABLE, "unsupported");
  }

  // ── CNY: priced internally, not by the provider. ────────────────────────
  //
  // Short-circuited before any pair lookup, because there is no USDT/CNY pair
  // on this account and never will be — no provider holds yuan for this
  // business. Left to the lookups below, every CNY pair would come back as
  // "isn't quoted by our liquidity provider yet", which is true of the
  // provider and false of the product.
  if (from === "CNY" || to === "CNY") {
    return resolveCnyRoute(from, to, source);
  }

  // ── USDT on one side: a single direct pair lookup. ──────────────────────
  if (from === "USDT" || to === "USDT") {
    const fiat = from === "USDT" ? to : from;
    const pair = await pairRates(fiat, source);
    if (!pair) {
      return unavailable(
        from,
        to,
        `USDT/${fiat} isn't quoted by our liquidity provider yet, so this route is unavailable. Convert via another wallet in the meantime.`,
        // Maintenance, not "unsupported". A pair the provider stops quoting
        // is a route this product offers which is down — GHS today — and the
        // word has to promise it is coming back, because it is.
        "maintenance",
      );
    }

    if (from === "USDT") {
      // USDT -> fiat: sellRate is already fiat per 1 USDT.
      const marked = await markedRate(from, to, pair.sellRate, source);
      return directRoute("usdt_to_fiat", from, to, marked, 1);
    }

    // fiat -> USDT: buyRate is fiat per 1 USDT, so invert for USDT per 1 fiat.
    const providerRate = 1 / pair.buyRate;
    const marked = await markedRate(from, to, providerRate, source);
    return directRoute("fiat_to_usdt", from, to, marked, providerRate);
  }

  // ── fiat -> fiat: bridge through USDT. ─────────────────────────────────
  const [fromPair, toPair] = await Promise.all([
    pairRates(from, source),
    pairRates(to, source),
  ]);

  if (!fromPair) {
    return unavailable(
      from,
      to,
      `USDT/${from} isn't quoted by our liquidity provider yet, so ${from} can't be converted at the moment.`,
      "maintenance",
    );
  }
  if (!toPair) {
    return unavailable(
      from,
      to,
      `USDT/${to} isn't quoted by our liquidity provider yet, so ${to} can't be converted at the moment.`,
      "maintenance",
    );
  }

  // 1 `from` buys (1 / fromPair.buyRate) USDT; each USDT sells for
  // toPair.sellRate of `to`.
  const sourceUsdtRate = 1 / fromPair.buyRate;
  const providerRate = sourceUsdtRate * toPair.sellRate;
  const marked = await markedRate(from, to, providerRate, source);
  return directRoute("fiat_via_usdt", from, to, marked, sourceUsdtRate);
}

/**
 * Availability for a CNY pair, and an indicative rate that is never displayed.
 *
 * THE RATES ON THIS ROUTE ARE A FLOOR, NOT A PRICE. A CNY rate depends on the
 * size of the order (the ladder), and this function has no amount — so it
 * reports the LOWEST band, which is the worst rate a buyer can get. Anything
 * that needs a real figure calls quoteCnyConversion with the amount;
 * quoteConversion and executeConversion both branch on kind === "cny_ledger"
 * to do exactly that. The numbers here exist so callers that only need
 * availability (listRoutesFrom, the account pages) keep working unchanged.
 *
 * Erring on the low side is deliberate: an indicative figure that is worse
 * than the real one cannot turn into a promise we then fail to honour.
 */
async function resolveCnyRoute(
  from: Currency,
  to: Currency,
  source: RateSource,
): Promise<ConversionRoute> {
  const nonCny: Currency = from === "CNY" ? to : from;

  const blocker = cnyRouteBlocker(nonCny);
  if (blocker) return unavailable(from, to, blocker, cnyBlockerKind(nonCny));

  const config = await loadCnyPricingConfig();
  const tierRate = indicativeCnyRate(config);
  if (tierRate == null) {
    return unavailable(
      from,
      to,
      "Yuan pricing isn't configured yet. Please try again later.",
      // A missing ladder is an operational gap on our side that a human
      // fills in /admin/rates. Temporary by nature, so: maintenance.
      "maintenance",
    );
  }

  // The fiat leg has to be quotable for a fiat payer, and finding that out
  // here rather than at submit time is the whole point of this function.
  let usdtPerNonCnyUnit = 1;
  if (nonCny !== "USDT") {
    const pair = await pairRates(nonCny, source);
    if (!pair) {
      return unavailable(
        from,
        to,
        `${nonCny} can't be converted to or from yuan at the moment. Convert via USDT in the meantime.`,
        "maintenance",
      );
    }
    usdtPerNonCnyUnit = 1 / pair.buyRate;
  }

  const markupRate = cnyMarkupFor(config, nonCny);
  const providerRate =
    from === "CNY"
      ? // CNY -> non-CNY: 1 CNY is 1/tierRate USDT, then out through the leg.
        1 / tierRate / usdtPerNonCnyUnit
      : // non-CNY -> CNY: into USDT, then up the ladder.
        usdtPerNonCnyUnit * tierRate;

  return {
    available: true,
    kind: "cny_ledger",
    from,
    to,
    providerRate,
    markupRate,
    customerRate: applyMarkupToRate(providerRate, markupRate),
    sourceUsdtRate: from === "CNY" ? 1 / tierRate : usdtPerNonCnyUnit,
  };
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
  source: RateSource = "live",
): Promise<ConversionRoute[]> {
  return Promise.all(
    candidates.filter((c) => c !== from).map((to) => resolveRoute(from, to, source)),
  );
}

import { unstable_cache } from "next/cache";
import type { Currency } from "@/lib/types/database";
import { getUsdtPairRates, type UsdtPairRates } from "@/lib/busha/rate";
import { getMarkupRate } from "@/lib/rates/markup";

/**
 * GROUP 9a — a 30-second shared cache for the rates and markups that are only
 * ever DISPLAYED, and never for the ones a transfer settles at.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT WAS COSTING WHAT
 *
 * The board on /home resolves two routes per local currency, and each route
 * is a provider pair lookup plus a markup row read. Three currencies is
 * twelve round trips — six over the public internet to the provider, six to
 * Postgres — on every single render of /home, which is `force-dynamic`. Open
 * /accounts/NGN and /convert and the same pair is fetched again, from
 * scratch, three times in a row. Two users on the product at once doubled it.
 *
 * None of that work differs by user. A USDT/NGN pair price is the same number
 * for everybody, and so is the markup row. So it is cached once, for everyone,
 * and `unstable_cache`'s store is the data cache rather than per-request
 * memoisation — which is the distinction that makes "shared across users"
 * true rather than aspirational.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY 30 SECONDS, AND WHY THAT IS SAFE TO SHOW
 *
 * A displayed rate is already not a promise: /convert prices a quote on the
 * server when the user types an amount, holds it on a countdown, and
 * re-resolves at execution. The board is advertising, the quote is the
 * commitment, and the product has always been built that way. So the question
 * is only how stale an advertisement may be before it misleads, and 30
 * seconds is short enough that the figure a user reads and the quote they get
 * seconds later agree to the digit that matters.
 *
 * It also matches what the UI already tells them: LiveRefresh re-renders the
 * strip on its own schedule and stamps it "Rates updated", so a cached figure
 * is never presented as more current than it is.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE RULE THAT MATTERS MOST: NO COMMIT PATH MAY READ THIS FILE
 *
 * A conversion, a Pay-to-China payment and a CNY quote all re-resolve their
 * route at the moment they commit, and every one of them must see a live
 * rate. Settling at a 29-second-old price is the business eating the
 * difference, or the customer doing so — and it would be invisible, because
 * the number would look perfectly reasonable in the row afterwards.
 *
 * Two things enforce it rather than one comment asking nicely:
 *
 *   1. resolveRoute takes a RATE SOURCE and DEFAULTS TO LIVE. A caller that
 *      forgets gets fresh data. The cache is opt-in, in the display callers
 *      (resolveRateBoard, listRoutesFrom) and nowhere else.
 *   2. src/lib/rates/cache.test.ts asserts that none of the commit modules
 *      imports this file, by reading their source. A future refactor that
 *      wires a cached lookup into executeConversion fails `npm test` rather
 *      than shipping.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE TAG, AND WHY AN ADMIN EDIT CANNOT WAIT 30 SECONDS
 *
 * An operator changing a markup on /admin/rates needs to see the new spread
 * on the board immediately — partly to confirm the edit landed, and mostly
 * because "did my change apply?" answered by a stale number is how somebody
 * edits it a second time. Every entry here carries RATES_CACHE_TAG, and the
 * markup actions call updateTag() on it, which both purges the entry and
 * gives the operator read-your-own-writes within the same action.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE E2E SUITE
 *
 * src/lib/e2e/mockProviders.ts answers /v1/pairs from MOCK_PAIR_PRICES, a
 * frozen table of constants. Caching a constant cannot make a test flaky:
 * every read inside the window returns what every read outside it would have
 * returned. And the paths the suite drives for correctness — the deposit
 * quote, the conversion quote — are commit paths, which never reach this
 * file at all. Verified by hand against that file rather than assumed.
 */

/** One tag for every cached rate input. Purged by the admin markup actions. */
export const RATES_CACHE_TAG = "rates:display";

/** Seconds. See the note above for why this number and not a longer one. */
export const RATES_CACHE_SECONDS = 30;

/**
 * A provider pair price, for DISPLAY ONLY.
 *
 * Returns the same shape as getUsdtPairRates, null included — a currency with
 * no pair on this account (GHS today) must cache its absence too, or the one
 * currency whose lookup is guaranteed to fail is also the one that pays for a
 * provider round trip on every render.
 */
export const cachedUsdtPairRates = unstable_cache(
  async (fiatCurrency: string): Promise<UsdtPairRates | null> =>
    getUsdtPairRates(fiatCurrency),
  ["busha", "usdt-pair-rates"],
  { revalidate: RATES_CACHE_SECONDS, tags: [RATES_CACHE_TAG] },
);

/**
 * A markup row, for DISPLAY ONLY.
 *
 * Cached for the same window as the pair price deliberately. Caching the
 * provider rate but not the spread would mean the board's two inputs expire
 * at different moments, so a figure could change on screen because of an
 * internal read rather than because the market moved.
 */
export const cachedMarkupRate = unstable_cache(
  async (base: Currency, quote: Currency): Promise<number> => getMarkupRate(base, quote),
  ["rates", "markup"],
  { revalidate: RATES_CACHE_SECONDS, tags: [RATES_CACHE_TAG] },
);

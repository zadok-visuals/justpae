import type { Currency } from "@/lib/types/database";
import type { UnavailableKind } from "@/lib/ui/unavailability";
import { CURRENCIES } from "@/lib/currencies";
import { resolveRoute } from "@/lib/rates/routes";
import { buyPriceFromFiatToUsdtRate, sellPriceFromUsdtToFiatRate } from "@/lib/rates/pairPricing";

/**
 * Server-only. The buy/sell rate board.
 *
 * ONE resolver behind every place a rate is advertised — Home's strip,
 * /convert, and each account page. They used to be free to each pick their own
 * pair list and their own orientation, and Home's strip did exactly that: it
 * showed "1 USD -> NGN" for three pairs that cannot be converted at all on
 * this account, and a single "1 USDT -> NGN" line that silently meant the SELL
 * side. A naira holder reading it and then opening /convert to buy USDT met a
 * different number with no explanation of which was which.
 *
 * The orientation is fixed for both sides: LOCAL CURRENCY PER 1 USDT. Quoting
 * the buy side as "USDT per naira" because that is the direction the route
 * runs in would be arithmetically correct and unreadable — 0.000724 is not a
 * price anybody can hold in their head next to 1,380.
 *
 * Both figures are the CUSTOMER's, markup included, because the markup is
 * already baked into the route rates this reads. Advertising a provider rate
 * and settling at a marked-up one is the fastest way to make someone feel
 * cheated, even when the spread is disclosed elsewhere.
 */

export interface UsdtPairDisplay {
  currency: Currency;
  /**
   * Local currency the customer PAYS for 1 USDT, markup included. Null when
   * that direction cannot be routed.
   */
  buyPrice: number | null;
  /** Local currency the customer RECEIVES for 1 USDT, markup included. */
  sellPrice: number | null;
  /**
   * Why, when either side is null. Taken from the route's own reason, so a
   * currency with no pair on this account (GHS today) says that rather than
   * disappearing from the board — a Ghanaian user whose currency is simply
   * missing is left wondering whether the app knows it exists.
   */
  unavailableReason: string | null;
  /**
   * GROUP 4f. The one-word form of the reason, so the board's own cell can
   * say "Maintenance" where that is what it is.
   *
   * The board printed a bare "Unavailable" for every pair it could not
   * price. That cell is the FIRST thing a cedi holder sees on /home and on
   * /accounts/GHS, and on both of those screens it was the only thing the app
   * said about the state of their currency — so "Unavailable" was, in effect,
   * the product telling them it does not do cedis. It does; the pair is down.
   *
   * Null when the pair prices normally.
   */
  unavailableKind: UnavailableKind | null;
}

/**
 * The currencies the board covers: the local fiat ones.
 *
 * USD is excluded because it has no USDT pair on this account and therefore no
 * buy or sell price to show — /convert and the account pages say so in words
 * (USD_CONVERSION_UNAVAILABLE), which is more use than two "Unavailable" cells.
 * USDT itself is excluded for the obvious reason: it is the thing being priced.
 *
 * Derived from the currency config rather than listed here, so adding a
 * currency to CURRENCIES puts it on the board automatically — the config is
 * meant to be the one place the list lives.
 */
export function localRateCurrencies(): Currency[] {
  return CURRENCIES.filter((c) => c.kind === "fiat" && c.country != null).map((c) => c.code);
}

/**
 * Both sides of one local currency's USDT pair.
 *
 * Resolved as two real routes rather than one pair lookup plus local
 * arithmetic. The point is that the number on the board is the number
 * /convert will quote: same resolver, same markup row, same unavailability
 * reasons. A cheaper shortcut here is how a board drifts away from the thing
 * it is advertising.
 */
export async function resolveUsdtPairDisplay(currency: Currency): Promise<UsdtPairDisplay> {
  // GROUP 9a — "cached". This module is the board, and the board ADVERTISES a
  // price; /convert's quote is what commits to one, and that path resolves
  // the same routes with the default "live". A 30-second-old advertisement is
  // honest (LiveRefresh stamps the strip with when it was updated); a
  // 30-second-old settlement is not, which is why the two are different
  // calls rather than one call with a shared cache.
  const [buyLeg, sellLeg] = await Promise.all([
    resolveRoute(currency, "USDT", "cached"),
    resolveRoute("USDT", currency, "cached"),
  ]);

  const buyPrice = buyLeg.available ? buyPriceFromFiatToUsdtRate(buyLeg.customerRate) : null;
  const sellPrice = sellLeg.available ? sellPriceFromUsdtToFiatRate(sellLeg.customerRate) : null;

  // Whichever side actually failed gets to explain itself. In practice both
  // sides fail together — they come from the same pair lookup — but a
  // one-sided outage must not be reported with the other side's silence.
  // Whichever leg explains itself also names the kind — they travel together
  // so a reworded reason and its badge cannot come apart.
  const failed =
    buyPrice == null && !buyLeg.available
      ? buyLeg
      : sellPrice == null && !sellLeg.available
        ? sellLeg
        : null;

  return {
    currency,
    buyPrice,
    sellPrice,
    unavailableReason: failed && !failed.available ? failed.reason : null,
    unavailableKind: failed && !failed.available ? failed.unavailableKind : null,
  };
}

/**
 * The whole board.
 *
 * One pair failing degrades to "Unavailable" for that currency alone — a
 * provider outage on one pair must not blank the board or fail the render of
 * the page carrying it.
 */
export async function resolveRateBoard(
  currencies: Currency[] = localRateCurrencies(),
): Promise<UsdtPairDisplay[]> {
  return Promise.all(
    currencies.map(async (currency) => {
      try {
        return await resolveUsdtPairDisplay(currency);
      } catch (err) {
        console.error("[rates.display] pair failed", { currency, err });
        return {
          currency,
          buyPrice: null,
          sellPrice: null,
          unavailableReason: "Rates are unavailable right now. Please try again in a moment.",
          // A pair that threw is an outage, which is the maintenance case.
          unavailableKind: "maintenance",
        };
      }
    }),
  );
}

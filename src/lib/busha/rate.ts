import * as busha from "@/lib/busha/client";
import { BushaError } from "@/lib/busha/client";

/**
 * Busha's swap quotes validate against this account's *real* balance and a
 * per-pair minimum (confirmed live: a 50,000 NGN probe failed "insufficient
 * balance" against an account holding only ~1,800 NGN; a 100 NGN probe failed
 * "The minimum sale amount is 262.05 NGN"). So a real amount can never be sent
 * to Busha directly for a rate lookup — it could easily exceed either ceiling.
 * Instead, probe with a tiny amount and fall back to whatever minimum Busha
 * itself reports, then derive the rate as a plain ratio of the quote's own
 * target_amount/source_amount — NOT by parsing rate.rate's string, whose
 * orientation isn't guaranteed.
 *
 * Also confirmed live: this account holds real fiat but can hold zero USDT, so
 * a USDT-sourced probe fails "insufficient balance" at ANY amount, including
 * the minimum — there is no probe amount that would ever work in that
 * direction. So every rate lookup built on this always probes fiat -> USDT
 * (never the reverse) and inverts the ratio when USDT -> fiat is what's
 * actually needed. That sidesteps depending on the account ever holding a real
 * USDT balance at all.
 */
export async function probeFiatToUsdtRate(fiatCurrency: string): Promise<number> {
  async function quoteAt(amount: string) {
    const quote = await busha.createQuote({
      sourceCurrency: fiatCurrency,
      targetCurrency: "USDT",
      sourceAmount: amount,
    });
    return Number(quote.target_amount) / Number(quote.source_amount);
  }

  try {
    return await quoteAt("1");
  } catch (err) {
    if (err instanceof BushaError) {
      // Busha's wording varies ("minimum sale amount", "Minimum trade amount")
      // depending on the pair — confirmed live for both — so match loosely on
      // "minimum ... amount is X".
      const match = err.message.match(/minimum .*?amount is ([\d.]+)/i);
      if (match) return await quoteAt(match[1]);
    }
    throw err;
  }
}

export interface UsdtPairRates {
  /**
   * Fiat cost to buy 1 USDT, and fiat received for selling 1 USDT — genuinely
   * different numbers (Busha's real bid/ask spread), not one rate inverted.
   * See getPair's header comment for why that endpoint, rather than
   * /v1/quotes, is what makes the sell side obtainable at all.
   */
  buyRate: number;
  sellRate: number;
}

/**
 * Live buy AND sell rate for a USDT/<fiat> pair. Returns null when Busha has
 * no pair for this currency at all — confirmed live: GHS has no USDT pair on
 * this account today, which is exactly why /convert disables GHS routes in the
 * UI with an explanation instead of letting them fail at submit.
 */
export async function getUsdtPairRates(fiatCurrency: string): Promise<UsdtPairRates | null> {
  const pair = await busha.getPair("USDT", fiatCurrency);
  if (!pair) return null;
  return {
    buyRate: Number(pair.buy_price.amount),
    sellRate: Number(pair.sell_price.amount),
  };
}

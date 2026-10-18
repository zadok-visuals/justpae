/**
 * "What did this cost us, at the time?" — with no imports, so it can be
 * tested without a database.
 *
 * Every margin figure in the USDT report is the gap between what a customer
 * paid and what the business paid its own supplier. The second half of that
 * is only knowable from the supplier rate that was IN FORCE when the order
 * happened, which is why supplier_rates is append-only: a new rate is a new
 * dated row, and old rows stay so that March's margin stays computed in
 * March's terms.
 *
 * DIRECTION CONVENTION, as everywhere: QUOTE per 1 BASE. A USDT/CNY rate of
 * 6.45 means one USDT costs us 6.45 yuan.
 */

export interface SupplierRateRow {
  base_currency: string;
  quote_currency: string;
  buy_rate: number;
  effective_from: string;
}

export interface RateLookup {
  rate: number;
  /**
   * True when NO rate existed yet at the order's own time — the order predates
   * the first rate anybody entered for this pair, so nothing was genuinely
   * "in force" then.
   *
   * THE ALTERNATIVE WAS TO SKIP THE ORDER, and that was worse. An operator who
   * starts recording supplier rates in month three gets a report that silently
   * omits months one and two, with a skip count they have to interpret. Using
   * the earliest rate on file is an estimate, it is clearly a better one than
   * nothing, and the flag is what stops it being presented as fact.
   */
  estimated: boolean;
}

/**
 * The USDT/<quote> rate that applies to an order placed at `at`.
 *
 *   1. the latest rate whose effective_from is still <= `at` — what was
 *      actually in force;
 *   2. failing that, the EARLIEST rate on file, flagged as an estimate;
 *   3. null only when the pair has no rate at all, ever — the one case where
 *      there is nothing to base even an estimate on.
 */
export function usdtRateAt(
  rates: SupplierRateRow[],
  quote: string,
  at: string,
): RateLookup | null {
  const pairRates = rates.filter(
    (r) => r.base_currency === "USDT" && r.quote_currency === quote,
  );
  if (pairRates.length === 0) return null;

  const inForce = pairRates
    .filter((r) => r.effective_from <= at)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
  if (inForce) return { rate: Number(inForce.buy_rate), estimated: false };

  const earliest = [...pairRates].sort((a, b) =>
    a.effective_from < b.effective_from ? -1 : 1,
  )[0];
  return { rate: Number(earliest.buy_rate), estimated: true };
}

/**
 * An amount in `currency`, expressed in USDT.
 *
 * USDT is the one unit every route in this business can be added to or
 * compared against — a report that mixes naira, yuan and shillings into one
 * "total" is a number that looks authoritative and means nothing. Returns
 * null when the pair has no rate at all, so the caller counts the order as
 * skipped rather than silently as zero.
 */
export function toUsdt(
  amount: number,
  currency: string,
  rates: SupplierRateRow[],
  at: string,
): RateLookup & { usdt: number } | null {
  if (currency === "USDT") return { usdt: amount, rate: 1, estimated: false };
  const lookup = usdtRateAt(rates, currency, at);
  if (!lookup || lookup.rate <= 0) return null;
  return { usdt: amount / lookup.rate, rate: lookup.rate, estimated: lookup.estimated };
}

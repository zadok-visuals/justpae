/**
 * What the treasury page is actually asking: for each currency, what do the
 * providers hold, what do we owe customers, and which way does that leave us.
 *
 * Import-free and pure. The warnings below are the whole value of the page —
 * a number nobody compares to anything is a number nobody acts on — so they
 * are a function rather than JSX, and they are tested.
 */

export interface ProviderBalances {
  /** Currency code to available balance. A currency the provider does not
   *  list, or a read that failed, is simply absent. */
  korapay: Record<string, number>;
  busha: Record<string, number>;
}

export interface TreasuryRow {
  currency: string;
  korapay: number | null;
  busha: number | null;
  /** What customers could ask for, summed from their wallets. */
  liabilities: number;
  /** Provider balances minus liabilities. Negative means short. */
  difference: number | null;
}

export function treasuryRows(
  balances: ProviderBalances,
  liabilities: Record<string, number>,
): TreasuryRow[] {
  const currencies = new Set([
    ...Object.keys(balances.korapay),
    ...Object.keys(balances.busha),
    ...Object.keys(liabilities),
  ]);

  return [...currencies].sort().map((currency) => {
    const korapay = balances.korapay[currency] ?? null;
    const busha = balances.busha[currency] ?? null;
    const owed = liabilities[currency] ?? 0;
    const held = korapay == null && busha == null ? null : (korapay ?? 0) + (busha ?? 0);
    return {
      currency,
      korapay,
      busha,
      liabilities: owed,
      difference: held == null ? null : held - owed,
    };
  });
}

export interface TreasuryWarning {
  currency: string;
  text: string;
}

/**
 * The two warnings the brief asks for, and nothing speculative beside them.
 *
 *   1. Conversions out of naira are funded from the payout provider's naira
 *      balance. If pending conversions exceed it, the next one to settle
 *      fails at the provider rather than here.
 *   2. Withdrawals already debited and waiting on a provider are a
 *      commitment. A provider balance that cannot cover the queue waiting on
 *      IT is the thing that turns a slow payout into a stuck one.
 *
 * A null balance produces NO warning: "we could not read it" is not "it is
 * empty", and crying wolf on an API hiccup is how a real warning gets
 * ignored.
 */
export function treasuryWarnings(input: {
  bushaNgn: number | null;
  pendingNgnConversions: number;
  /** Per provider, per currency: what withdrawals are waiting on it. */
  pendingWithdrawals: { provider: string; currency: string; total: number }[];
  balances: ProviderBalances;
}): TreasuryWarning[] {
  const warnings: TreasuryWarning[] = [];

  if (input.bushaNgn != null && input.pendingNgnConversions > input.bushaNgn) {
    warnings.push({
      currency: "NGN",
      text: `Pending naira conversions total ${input.pendingNgnConversions.toLocaleString("en-US")}, which is more than the Busha naira balance of ${input.bushaNgn.toLocaleString("en-US")}.`,
    });
  }

  for (const waiting of input.pendingWithdrawals) {
    if (waiting.total <= 0) continue;
    const held =
      waiting.provider === "korapay"
        ? input.balances.korapay[waiting.currency]
        : input.balances.busha[waiting.currency];
    if (held == null) continue;
    if (waiting.total <= held) continue;

    const name = waiting.provider === "korapay" ? "Korapay" : "Busha";
    warnings.push({
      currency: waiting.currency,
      text: `${waiting.currency} withdrawals waiting on ${name} total ${waiting.total.toLocaleString("en-US")}, which is more than its balance of ${held.toLocaleString("en-US")}.`,
    });
  }

  return warnings;
}

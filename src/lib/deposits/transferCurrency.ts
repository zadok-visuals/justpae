// Relative, with extensions — reachable from transferCurrency.test.ts, which
// runs under plain `node --test` with no "@/" alias resolver. This module
// has no imports of its own, so there is nothing else to convert.

/**
 * GROUP 7. Whether a provider's confirmed transfer is actually denominated in
 * the currency the deposit row is about to be recorded under.
 *
 * THE BUG THIS GUARDS AGAINST. initiateDeposit records the deposit's
 * `currency` from the FORM SUBMISSION, not from Busha's own confirmed
 * transfer — the transfer is fetched by `quoteId` alone, and a quote and the
 * form that ultimately submits it are two separate round trips. If a client
 * resends a stale `quoteId` against a form now showing a different currency
 * (a race between two tabs, a replayed request, a bug in the picker's own
 * state), the insert currently has no way to notice: it would record a KES
 * deposit, say, for money Busha confirms it actually moved in NGN, which
 * silently wrong-foots the customer's balance and attributes a deposit to
 * the wrong wallet entirely.
 *
 * So this is checked before every insert, and a mismatch is refused rather
 * than recorded — failing to log a deposit is a bad minute; crediting the
 * wrong currency is a wrong balance that has to be unwound by hand.
 */
export function transferCurrencyMatches(
  requestedCurrency: string,
  transferTargetCurrency: string,
): boolean {
  return requestedCurrency === transferTargetCurrency;
}

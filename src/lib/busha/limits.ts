import type { Currency } from "@/lib/types/database";

/**
 * Below this, Busha's own minimum rejects the request with a generic error
 * after the user has already submitted. Enforced client-side (disable submit,
 * explain why) AND server-side (can't be bypassed) in every conversion flow.
 *
 * No RUNTIME imports, deliberately — the one import above is a type and is
 * erased at compile time, so this stays safe to use from both Client
 * Components and server actions.
 */
export const MINIMUM_USDT_EQUIVALENT = 10;

/**
 * Round, friendly CONVERSION minimums shown to the user instead of "the
 * minimum is about 10 USDT in NGN". Nobody about to spend naira thinks in
 * USDT, and a message the user has to convert in their head to act on is a
 * message that gets ignored.
 *
 * Each figure sits just above the 10 USDT equivalent at the rates in effect on
 * 2026-10-10 (roughly USDT/NGN 1480, USDT/GHS 14.5, USDT/KES 130). They are
 * deliberately static and dated rather than computed live: a round number is
 * the point. getMinimumConversionAmount below is what keeps them honest if real
 * rates drift against them.
 */
export const MINIMUM_CONVERSION_AMOUNT: Record<Currency, number> = {
  USD: 10,
  NGN: 15000,
  GHS: 150,
  KES: 1500,
  USDT: 10,
  // ~10 USDT at the 6.5-6.6 CNY/USDT band in the ladder, rounded up to a
  // figure a person would actually say out loud.
  CNY: 100,
};

/**
 * The step a currency's minimum rounds UP to when the configured figure above
 * no longer clears the real floor. Keeps the adjusted number looking chosen
 * rather than like an exchange-rate artefact.
 */
const MINIMUM_ROUNDING_STEP: Record<Currency, number> = {
  USD: 1,
  NGN: 500,
  GHS: 10,
  KES: 100,
  USDT: 1,
  CNY: 10,
};

/**
 * The single source of truth for conversion-minimum messaging AND gating,
 * called with the same currency and the same live rate on the client and the
 * server so the two can never disagree about where the line is.
 *
 * `usdtPerUnit` is USDT per 1 unit of that currency. Omit it only while no live
 * rate is available; the configured figure is then returned as-is.
 *
 * Returns the configured round figure unless that figure would now fall UNDER
 * the real MINIMUM_USDT_EQUIVALENT floor — in which case it computes the exact
 * amount that clears the floor at the current rate and rounds up to the next
 * sensible step. So the provider's own minimum cannot be violated even if the
 * dated figures above go stale, and the user is never shown a minimum that the
 * server would then reject.
 */
export function getMinimumConversionAmount(
  currency: Currency,
  usdtPerUnit?: number | null,
): number {
  const configured = MINIMUM_CONVERSION_AMOUNT[currency];
  if (!usdtPerUnit || usdtPerUnit <= 0) return configured;

  if (configured * usdtPerUnit >= MINIMUM_USDT_EQUIVALENT) return configured;

  const exactRequired = MINIMUM_USDT_EQUIVALENT / usdtPerUnit;
  const step = MINIMUM_ROUNDING_STEP[currency];
  return Math.ceil(exactRequired / step) * step;
}

/**
 * Per-currency fiat DEPOSIT minimums, in the currency's own units.
 *
 * Below these the provider rejects — or, for KES, previously just silently
 * failed — the deposit after the user has already been through the quote step
 * and, on the bank-transfer path, possibly after they have already sent the
 * money. Enforced client-side (submit disabled with an inline reason) and
 * server-side in both getDepositQuote and initiateDeposit, so calling either
 * action directly cannot bypass it.
 *
 * KES 200 comes from confirmed live testing: deposits below it silently failed.
 *
 * NGN and GHS are deliberately UNSET rather than guessed. An invented number
 * here either blocks legitimate small deposits or lets through ones that still
 * fail — both worse than today's behaviour, which is simply no client-side
 * minimum. A currency absent from this map is not enforced at all. Set each one
 * once its real minimum is confirmed with the provider.
 *
 * Partial<Record<…>> on purpose: the lookup resolves to undefined for any
 * currency without a confirmed figure (USDT included, which has no fee or
 * minimum on this account today), and undefined means "do not enforce".
 */
export const FIAT_MINIMUM_DEPOSIT: Partial<Record<"NGN" | "GHS" | "KES", number>> = {
  KES: 200,
  // NGN: confirm with the provider before setting.
  // GHS: confirm before setting — and note GHS deposits route through the
  // secondary provider, so its minimum needs confirming there, not here.
};

/**
 * Safe lookup. Keyed only by the fiat currencies that can have a minimum, so a
 * currency outside that set always resolves to undefined instead of being cast
 * into the map and silently picking up a wrong figure.
 */
export function fiatMinimumDeposit(currency: string): number | undefined {
  return currency === "NGN" || currency === "GHS" || currency === "KES"
    ? FIAT_MINIMUM_DEPOSIT[currency]
    : undefined;
}

/**
 * Busha support confirmed there is a minimum payout amount on their side too —
 * a withdrawal below it fails with the same generic "Request validation
 * failed". 5 USDT is the figure support suggested testing with, not an official
 * per-currency minimum from their docs; easy to raise if they specify one.
 *
 * Lives here (a plain leaf constant) rather than in automated-payout.ts, which
 * imports the service-role admin client at module scope and must never reach a
 * client bundle.
 */
export const MINIMUM_WITHDRAWAL_USDT_THRESHOLD = 5;

/**
 * The withdrawal minimum expressed in the currency the user is actually
 * holding.
 *
 * The screen used to say "the minimum withdrawal is about 5 USD in NGN", which
 * fails twice over: nobody about to withdraw naira thinks in dollars, and
 * "about" means they cannot tell whether their amount clears it. The server
 * compares amount × rate against the 5 USD floor, so the honest thing to show
 * is that same floor converted back.
 *
 * `usdPerUnit` is USD per 1 unit of the currency — the same figure
 * usdEquivalent multiplies by. Omit it only when no live rate is available, in
 * which case null means "say nothing" rather than quote a number we'd have had
 * to invent.
 *
 * Rounds UP to the currency's step, exactly as getMinimumConversionAmount
 * does, so the figure shown is never one the server would then reject.
 */
export function getMinimumWithdrawalAmount(
  currency: string,
  usdPerUnit?: number | null,
): number | null {
  if (currency === "USD" || currency === "USDT") return MINIMUM_WITHDRAWAL_USDT_THRESHOLD;
  if (!usdPerUnit || usdPerUnit <= 0) return null;

  const exactRequired = MINIMUM_WITHDRAWAL_USDT_THRESHOLD / usdPerUnit;
  const step =
    currency === "NGN" || currency === "GHS" || currency === "KES"
      ? MINIMUM_ROUNDING_STEP[currency]
      : 1;
  return Math.ceil(exactRequired / step) * step;
}

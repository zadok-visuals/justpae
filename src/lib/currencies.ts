import type { Currency } from "@/lib/types/database";

/**
 * THE one place the currency list lives.
 *
 * Adding a currency is: add the value to the Postgres `currency` enum in a
 * new migration, then add an entry here. Every selector, wallet grid, rate
 * strip, deposit/withdraw/convert route table and formatter reads from this
 * module — nothing else enumerates currencies.
 *
 * THE ORDER OF THE ARRAY IS THE DISPLAY ORDER, everywhere. Wallet cards, the
 * accounts list, every picker.
 *
 * GROUP 1b set it to NGN, KES, USDT, CNY, GHS, USD: the two local fiat
 * wallets first, then the currency everything is priced through, then yuan
 * (which only some flows allow at all), then the two that are switched off.
 * src/lib/ui/currencyPicker.ts holds the same order and additionally demotes
 * whatever is unavailable to the bottom for the user looking at it.
 */
export interface CurrencyMeta {
  code: Currency;
  label: string;
  /**
   * NO `symbol` FIELD, DELIBERATELY. Money is displayed as the ISO code
   * everywhere in this product — "NGN 5,000.00", never "₦5,000.00". The field
   * is gone rather than merely unused so a new screen cannot reintroduce a
   * symbol by reaching for it.
   */
  flag: string;
  /** Minor units a balance is displayed with. */
  decimals: number;
  /**
   * How this balance is backed.
   *
   *   fiat       a real currency a provider holds for us.
   *   crypto     a real on-chain balance.
   *   synthetic  an internal obligation, with nothing held anywhere. CNY is
   *              the only one: no provider holds yuan for this business, so a
   *              CNY balance exists because we created it by selling the
   *              customer one, and it is discharged by Pay to China or by
   *              converting back out. It can never be withdrawn — the schema
   *              enforces that in 0026, not just the UI.
   */
  kind: "fiat" | "crypto" | "synthetic";
  /** Which country (if any) this is the local currency of. */
  country?: string;
}

export const CURRENCIES: CurrencyMeta[] = [
  { code: "NGN", label: "Nigerian Naira", flag: "🇳🇬", decimals: 2, kind: "fiat", country: "NG" },
  { code: "KES", label: "Kenyan Shilling", flag: "🇰🇪", decimals: 2, kind: "fiat", country: "KE" },
  // A coin, not "₮": USDT has no country flag, and the symbol it used to
  // borrow is exactly what this product no longer prints anywhere.
  { code: "USDT", label: "Tether USD", flag: "🪙", decimals: 2, kind: "crypto" },
  // Deliberately NO `country`. A `country` here means "signing up from there
  // provisions this wallet and bills can be paid in it" (see
  // LOCAL_WALLET_COUNTRIES, derived from this field) — and neither is true of
  // CNY. Every user gets a CNY wallet regardless of where they are, because
  // Pay to China is offered to all of them.
  { code: "CNY", label: "Chinese Yuan", flag: "🇨🇳", decimals: 2, kind: "synthetic" },
  // GHS and USD are both under maintenance (src/lib/services.ts) — unusable
  // options belong at the bottom of every list, not the middle or the front.
  { code: "GHS", label: "Ghanaian Cedi", flag: "🇬🇭", decimals: 2, kind: "fiat", country: "GH" },
  { code: "USD", label: "US Dollar", flag: "🇺🇸", decimals: 2, kind: "fiat" },
];

export const CURRENCY_CODES: Currency[] = CURRENCIES.map((c) => c.code);

const BY_CODE = new Map<Currency, CurrencyMeta>(CURRENCIES.map((c) => [c.code, c]));

export function currencyMeta(code: Currency): CurrencyMeta {
  const meta = BY_CODE.get(code);
  if (!meta) throw new Error(`Unknown currency: ${code}`);
  return meta;
}

export function isCurrency(value: string): value is Currency {
  return BY_CODE.has(value as Currency);
}

/** The local wallet currency for a signup country, or null if unsupported. */
export function localCurrencyForCountry(country: string | null | undefined): Currency | null {
  if (!country) return null;
  return CURRENCIES.find((c) => c.country === country)?.code ?? null;
}

/**
 * The ONE money string in this product: the ISO code, one space, the number.
 * "NGN 5,000.00", "USDT 10.00", "CNY 200.00". No currency symbol appears
 * anywhere — see the note on CurrencyMeta.
 */
export function formatAmount(currency: Currency, amount: number): string {
  const meta = currencyMeta(currency);
  return `${meta.code} ${formatNumber(amount, meta.decimals)}`;
}

/** Signed, for transaction rows: "−NGN 5,000.00" / "+NGN 5,000.00". */
export function formatSignedAmount(currency: Currency, amount: number, direction: "in" | "out"): string {
  const sign = direction === "in" ? "+" : "−";
  return `${sign}${formatAmount(currency, Math.abs(amount))}`;
}

/**
 * formatAmount, taken apart for the <Amount> component — which sets the code
 * and the decimals in their own sizes and weights. Kept here, beside
 * formatAmount, so the two can never disagree about grouping or decimals.
 *
 * UNSIGNED: the component draws its own "+" or "−" at the whole number's
 * size, so a minus folded into `whole` here would render at the wrong size
 * and in the wrong place.
 */
export function splitAmount(
  currency: Currency,
  amount: number,
): { code: Currency; whole: string; decimals: string } {
  const meta = currencyMeta(currency);
  const [whole, decimals = ""] = formatNumber(Math.abs(amount), meta.decimals).split(".");
  return { code: meta.code, whole, decimals };
}

/** Bare number with thousands separators, no symbol — for inputs and rates. */
export function formatNumber(amount: number, decimals = 2): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Human rate line, e.g. "1 USDT = NGN 1,392.01". Rates throughout this codebase
 * are always expressed as QUOTE per 1 BASE, matching how the provider reports
 * them — keeping one direction everywhere is what makes the markup maths and
 * the PNL report auditable.
 */
export function formatRate(base: Currency, quote: Currency, rate: number): string {
  const decimals = rate < 1 ? 6 : 2;
  return `1 ${base} = ${currencyMeta(quote).code} ${formatNumber(rate, decimals)}`;
}

/**
 * WHY EVERY USD CONVERSION IS UNAVAILABLE, in the one place that says so.
 *
 * Every conversion in this app is priced and executed through USDT — a fiat
 * pair against USDT directly, or two of those bridged. Our liquidity provider
 * quotes no USDT/USD pair on this account, so USD has no leg of its own and
 * therefore no route to or from anything, including USDT itself.
 *
 * The honest consequence is that USD cannot be converted at all today. What
 * matters is that the user is TOLD that, in those words, everywhere USD can
 * be picked — rather than being allowed to select it, type an amount, enter a
 * PIN and then meet "rates are unavailable right now", which is both wrong
 * and the most expensive possible moment to be wrong.
 *
 * GROUP 2. The USD wallet is now modelled as its own maintenance service
 * (src/lib/services.ts, NEXT_PUBLIC_FEATURE_USD_WALLET) rather than a
 * standing, permanent fact — the flag is what resolveRoute() in
 * src/lib/rates/routes.ts actually checks before falling back to this
 * message, so the two cannot drift: turn the flag on and this stops firing.
 */
export const USD_CONVERSION_UNAVAILABLE =
  "USD is under maintenance. We'll let you know when it's back.";

/** True when a pair cannot be routed because one side is USD. */
export function isUsdPair(from: Currency, to: Currency): boolean {
  return from === "USD" || to === "USD";
}

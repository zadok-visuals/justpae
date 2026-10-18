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
 * accounts list, every picker. GHS is last because it is under maintenance
 * and an unusable option belongs at the bottom of a list, not in the middle
 * of one.
 */
export interface CurrencyMeta {
  code: Currency;
  label: string;
  symbol: string;
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
  { code: "USD", label: "US Dollar", symbol: "$", flag: "🇺🇸", decimals: 2, kind: "fiat" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦", flag: "🇳🇬", decimals: 2, kind: "fiat", country: "NG" },
  // Deliberately NO `country`. A `country` here means "signing up from there
  // provisions this wallet and bills can be paid in it" (see
  // LOCAL_WALLET_COUNTRIES, derived from this field) — and neither is true of
  // CNY. Every user gets a CNY wallet regardless of where they are, because
  // Pay to China is offered to all of them.
  { code: "CNY", label: "Chinese Yuan", symbol: "¥", flag: "🇨🇳", decimals: 2, kind: "synthetic" },
  { code: "USDT", label: "Tether USD", symbol: "₮", flag: "₮", decimals: 2, kind: "crypto" },
  { code: "KES", label: "Kenyan Shilling", symbol: "KSh", flag: "🇰🇪", decimals: 2, kind: "fiat", country: "KE" },
  // Last, deliberately: cedis are under maintenance, and an option nobody can
  // use belongs at the bottom of every list rather than the middle of one.
  { code: "GHS", label: "Ghanaian Cedi", symbol: "₵", flag: "🇬🇭", decimals: 2, kind: "fiat", country: "GH" },
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

export function formatAmount(currency: Currency, amount: number): string {
  const meta = currencyMeta(currency);
  return `${meta.symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  })}`;
}

/** Signed, for transaction rows: "−₦5,000.00" / "+₦5,000.00". */
export function formatSignedAmount(currency: Currency, amount: number, direction: "in" | "out"): string {
  const sign = direction === "in" ? "+" : "−";
  return `${sign}${formatAmount(currency, Math.abs(amount))}`;
}

/** Bare number with thousands separators, no symbol — for inputs and rates. */
export function formatNumber(amount: number, decimals = 2): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Human rate line, e.g. "1 USDT = ₦1,364.26". Rates throughout this codebase
 * are always expressed as QUOTE per 1 BASE, matching how the provider reports
 * them — keeping one direction everywhere is what makes the markup maths and
 * the PNL report auditable.
 */
export function formatRate(base: Currency, quote: Currency, rate: number): string {
  const decimals = rate < 1 ? 6 : 2;
  return `1 ${base} = ${currencyMeta(quote).symbol}${formatNumber(rate, decimals)}`;
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
 * It is tied to dollar receiving because that is the same dependency: the
 * provider that will hold real USD for this account is the one that would
 * quote it. When /receive launches, this goes away.
 */
export const USD_CONVERSION_UNAVAILABLE =
  "USD conversions open when dollar receiving launches. Dollars you hold can't be converted yet.";

/** True when a pair cannot be routed because one side is USD. */
export function isUsdPair(from: Currency, to: Currency): boolean {
  return from === "USD" || to === "USD";
}

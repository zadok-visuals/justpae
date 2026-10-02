import type { Currency } from "@/lib/types/database";

/**
 * THE one place the currency list lives.
 *
 * Adding a currency (CNY being the obvious next one) is: add the value to the
 * Postgres `currency` enum in a new migration, then add an entry here. Every
 * selector, wallet grid, rate strip, deposit/withdraw/convert route table and
 * formatter reads from this module — nothing else enumerates currencies.
 *
 * Deliberately NOT built now: CNY and everything RMB. The entry is absent, not
 * commented out, so no half-wired code path exists for it.
 */
export interface CurrencyMeta {
  code: Currency;
  label: string;
  symbol: string;
  flag: string;
  /** Minor units a balance is displayed with. */
  decimals: number;
  /** Crypto currencies skip bank-style recipient fields and use an address. */
  kind: "fiat" | "crypto";
  /** Which country (if any) this is the local currency of. */
  country?: string;
}

export const CURRENCIES: CurrencyMeta[] = [
  { code: "USD", label: "US Dollar", symbol: "$", flag: "🇺🇸", decimals: 2, kind: "fiat" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦", flag: "🇳🇬", decimals: 2, kind: "fiat", country: "NG" },
  { code: "GHS", label: "Ghanaian Cedi", symbol: "₵", flag: "🇬🇭", decimals: 2, kind: "fiat", country: "GH" },
  { code: "KES", label: "Kenyan Shilling", symbol: "KSh", flag: "🇰🇪", decimals: 2, kind: "fiat", country: "KE" },
  { code: "USDT", label: "Tether USD", symbol: "₮", flag: "₮", decimals: 2, kind: "crypto" },
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

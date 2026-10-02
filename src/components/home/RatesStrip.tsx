import { formatNumber, currencyMeta } from "@/lib/currencies";
import type { Currency } from "@/lib/types/database";

export interface StripRate {
  base: Currency;
  quote: Currency;
  /** The CUSTOMER rate — what they would actually get, markup included. */
  customerRate: number | null;
}

/**
 * The live rates strip.
 *
 * Shows CUSTOMER rates, not provider rates. Advertising the raw provider rate
 * and then settling at a marked-up one is the fastest way to make a user feel
 * cheated, even when the markup is disclosed elsewhere — the number they
 * remember is the one on the home screen.
 *
 * A pair the provider cannot quote shows as unavailable rather than being
 * hidden: GHS has no USDT pair on this account today, and silently dropping it
 * would leave a Ghanaian user wondering why their currency is missing.
 */
export function RatesStrip({ rates }: { rates: StripRate[] }) {
  if (rates.length === 0) return null;

  return (
    <div className="snap-rail -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {rates.map(({ base, quote, customerRate }) => (
        <div
          key={`${base}/${quote}`}
          className="flex min-w-[9.5rem] shrink-0 flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2"
        >
          <span className="text-xs text-muted-foreground">
            1 {base} → {quote}
          </span>
          {customerRate == null ? (
            <span className="text-sm font-medium text-muted-foreground">Unavailable</span>
          ) : (
            <span className="font-mono text-sm font-medium tabular-nums text-foreground">
              {currencyMeta(quote).symbol}
              {formatNumber(customerRate, customerRate < 1 ? 4 : 2)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

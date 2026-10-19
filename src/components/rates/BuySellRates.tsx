import { formatAmount, currencyMeta } from "@/lib/currencies";
import { UnavailableBadge } from "@/components/ui/MaintenanceBadge";
import type { UsdtPairDisplay } from "@/lib/rates/display";

/**
 * The buy/sell rate board, rendered.
 *
 * ONE component for all three places a rate board appears — Home's strip,
 * /convert and each account page — so a naira holder reads the same two
 * numbers, in the same orientation, wherever they look. Three bespoke rate
 * displays is how an app ends up quoting the same pair three different ways,
 * which is precisely what this replaces.
 *
 * Both figures are the customer's own, markup included (see
 * src/lib/rates/display.ts), and both are in LOCAL CURRENCY PER 1 USDT so they
 * sit next to each other and the spread between them is legible at a glance.
 *
 * "Buy" and "Sell" are written from the CUSTOMER's side of the counter: buy is
 * what it costs them to get a USDT, sell is what they get for one. Writing
 * them from ours would invert both labels and is the single easiest way to
 * mislead somebody about a price.
 */
export function BuySellRates({
  rates,
  variant = "stacked",
  className = "",
}: {
  rates: UsdtPairDisplay[];
  /**
   * "strip" is the horizontal rail Home uses under its wallet cards;
   * "stacked" is the full-width list /convert and the account pages use.
   */
  variant?: "strip" | "stacked";
  className?: string;
}) {
  if (rates.length === 0) return null;

  if (variant === "strip") {
    return (
      <div className={`snap-rail -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0 ${className}`}>
        {rates.map((rate) => (
          <div
            key={rate.currency}
            className="flex min-w-[11.5rem] shrink-0 flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {currencyMeta(rate.currency).flag} {rate.currency} / USDT
            </span>
            <RateLines rate={rate} compact />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {rates.map((rate) => (
        <div
          key={rate.currency}
          className="rounded-xl border border-border bg-card px-4 py-3"
        >
          <span className="text-sm font-medium text-foreground">
            {currencyMeta(rate.currency).flag} {rate.currency}
          </span>
          <div className="mt-1.5">
            <RateLines rate={rate} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The two lines themselves.
 *
 * An unavailable pair keeps its slot and says why. Hiding it would leave a
 * user whose currency is the missing one with no explanation at all — and GHS
 * genuinely has no USDT pair on this account today, so this is the normal
 * case for a real customer, not a rare error state.
 */
function RateLines({ rate, compact = false }: { rate: UsdtPairDisplay; compact?: boolean }) {
  const { currency, buyPrice, sellPrice, unavailableReason, unavailableKind } = rate;

  if (buyPrice == null && sellPrice == null) {
    return (
      <>
        {/* GROUP 4f. This cell used to read "Unavailable" for every reason a
            pair cannot be priced, and it is the ONLY thing Home's strip and
            the GHS account page say about that currency. A badge naming the
            actual state — Maintenance for a pair that is down, which is the
            normal case for cedis today — is the difference between "this is
            coming back" and "this product doesn't do my money".

            A badge rather than plain text on purpose: it matches the
            Maintenance marker already used on the Bills tiles and in the nav,
            so one state has one appearance everywhere. */}
        <UnavailableBadge kind={unavailableKind ?? "maintenance"} />
        {!compact && unavailableReason && (
          <p className="mt-1 text-xs text-muted-foreground">{unavailableReason}</p>
        )}
      </>
    );
  }

  const size = compact ? "text-xs" : "text-sm";

  return (
    <dl className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <dt className={`${size} text-muted-foreground`}>Buy USDT at</dt>
        <dd className={`font-mono ${size} font-medium tabular-nums text-foreground`}>
          {buyPrice == null ? "—" : formatAmount(currency, buyPrice)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <dt className={`${size} text-muted-foreground`}>Sell USDT at</dt>
        <dd className={`font-mono ${size} font-medium tabular-nums text-foreground`}>
          {sellPrice == null ? "—" : formatAmount(currency, sellPrice)}
        </dd>
      </div>
    </dl>
  );
}

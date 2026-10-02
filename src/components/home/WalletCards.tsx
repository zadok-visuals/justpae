import { currencyMeta, formatAmount } from "@/lib/currencies";
import type { Currency, Wallet } from "@/lib/types/database";

/**
 * Wallet balances.
 *
 * MOBILE: a horizontally swipeable rail with scroll snapping, so a user with
 * four wallets flicks through them in the space one card occupies. Native
 * scroll snap rather than a JS carousel — the browser's own physics beat a
 * hand-rolled spring, and `touch-action: pan-y` on the rail (see globals.css)
 * hands vertical panning back so the page doesn't jitter during a horizontal
 * swipe.
 *
 * DESKTOP: the same cards in a grid. Nothing is hidden at a width that can
 * show everything.
 *
 * Each currency carries its own wash so the card is identifiable at a glance,
 * by colour, before the label is read.
 */

const WASHES: Record<Currency, string> = {
  USD: "from-naira/25 to-card",
  NGN: "from-gold/25 to-card",
  GHS: "from-gold-dark/30 to-card",
  KES: "from-naira-light/20 to-card",
  USDT: "from-ink-raised to-card",
};

function WalletCard({ wallet }: { wallet: Wallet }) {
  const meta = currencyMeta(wallet.currency);

  return (
    <article
      className={`snap-item flex min-w-[15rem] shrink-0 flex-col justify-between gap-5 rounded-xl border border-border bg-gradient-to-br p-4 sm:min-w-0 ${
        WASHES[wallet.currency]
      }`}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-lg leading-none">
          {meta.flag}
        </span>
        <span className="text-sm font-medium text-foreground">{wallet.currency}</span>
        <span className="truncate text-xs text-muted-foreground">{meta.label}</span>
      </div>

      <p className="font-display text-2xl font-semibold tabular-nums text-foreground">
        {formatAmount(wallet.currency, wallet.balance)}
      </p>
    </article>
  );
}

export function WalletCards({ wallets }: { wallets: Wallet[] }) {
  // Config order, not database order, so the cards don't reshuffle between
  // page loads depending on how rows came back.
  const ordered = [...wallets].sort(
    (a, b) => orderIndex(a.currency) - orderIndex(b.currency),
  );

  return (
    <>
      {/* Mobile rail. The negative margin plus matching padding lets the first
          and last card sit flush with the page edge while still scrolling
          edge to edge, instead of being inset by the page gutter. */}
      <div className="snap-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:hidden">
        {ordered.map((wallet) => (
          <WalletCard key={wallet.currency} wallet={wallet} />
        ))}
      </div>

      <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((wallet) => (
          <WalletCard key={wallet.currency} wallet={wallet} />
        ))}
      </div>
    </>
  );
}

const ORDER: Currency[] = ["USD", "NGN", "GHS", "KES", "USDT"];
function orderIndex(currency: Currency): number {
  const index = ORDER.indexOf(currency);
  return index === -1 ? ORDER.length : index;
}

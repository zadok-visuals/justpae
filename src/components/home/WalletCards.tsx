import Link from "next/link";
import { CURRENCIES, currencyMeta, formatAmount } from "@/lib/currencies";
import { isWalletLocked } from "@/lib/services";
import { MaintenanceBadge } from "@/components/ui/MaintenanceBadge";
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

// Drawn from the service-icon palette, so a wallet card and a service circle
// for the same idea are the same colour. USDT stays neutral: it is the one
// balance that is not a national currency.
const WASHES: Record<Currency, string> = {
  USD: "from-icon-blue/20 to-card",
  NGN: "from-icon-green/20 to-card",
  CNY: "from-icon-coral/20 to-card",
  USDT: "from-muted to-card",
  KES: "from-icon-teal/20 to-card",
  GHS: "from-icon-gold/20 to-card",
};

/**
 * Each card is a LINK to that wallet's own page.
 *
 * A balance on its own is a dead end: it says how much, and nothing about
 * what can be done with it. Tapping the figure is the obvious gesture for
 * "tell me more about this money", and before /accounts/[currency] existed it
 * did nothing at all — which taught people the cards were decoration.
 *
 * `<a>` wrapping the whole card rather than a "View" affordance in the
 * corner: the tap target is then the card, which on a phone is the difference
 * between hitting it and hunting for it.
 */
function WalletCard({ wallet }: { wallet: Wallet }) {
  const meta = currencyMeta(wallet.currency);
  const locked = isWalletLocked(wallet.currency);

  const content = (
    <>
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="text-lg leading-none">
          {meta.flag}
        </span>
        <span className="text-sm font-medium text-foreground">{wallet.currency}</span>
        {/* The full name only once there is room for it: at 46% of a 360px
            screen it was always truncated to two characters. */}
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{meta.label}</span>
        {locked && <MaintenanceBadge className="ml-auto shrink-0" />}
      </span>

      <span className="font-display text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
        {formatAmount(wallet.currency, wallet.balance)}
      </span>
    </>
  );

  // 46% of the rail on a phone: two cards fully visible with a sliver of the
  // third showing, which is what tells anyone the row continues. A fixed
  // 15rem showed one and a half and read as a layout bug.
  const className = `snap-item flex w-[46%] shrink-0 flex-col justify-between gap-4 rounded-xl border border-border bg-gradient-to-br p-3 shadow-card sm:w-auto sm:gap-5 sm:p-4 ${
    WASHES[wallet.currency]
  }`;

  // GROUP 2b. A locked wallet (USD, GHS while their flag is off) shows the
  // same card but is not a link — there is nowhere useful to send a tap, and
  // a card that looks tappable and does nothing is worse than one that is
  // honestly not a button.
  if (locked) {
    return (
      <div
        aria-label={`${meta.label} account, under maintenance, balance ${formatAmount(wallet.currency, wallet.balance)}`}
        className={`${className} opacity-80`}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/accounts/${wallet.currency}`}
      aria-label={`${meta.label} account, balance ${formatAmount(wallet.currency, wallet.balance)}`}
      className={className}
    >
      {content}
    </Link>
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

// Config order — src/lib/currencies.ts is the one place the display order
// lives, so a currency added or reordered there moves here too rather than
// needing a second list kept in step by hand.
const ORDER: Currency[] = CURRENCIES.map((c) => c.code);
function orderIndex(currency: Currency): number {
  const index = ORDER.indexOf(currency);
  return index === -1 ? ORDER.length : index;
}

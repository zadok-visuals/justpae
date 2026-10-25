import Link from "next/link";
import { Amount } from "@/components/ui/Amount";
import { CURRENCIES, currencyMeta, formatAmount } from "@/lib/currencies";
import { isWalletLocked } from "@/lib/services";
import { MaintenanceBadge } from "@/components/ui/MaintenanceBadge";
import type { Currency, Wallet } from "@/lib/types/database";

/**
 * Wallet balances, on /accounts.
 *
 * GROUP 3i — THEY LEFT HOME, AND THEY LOST THEIR WASHES.
 *
 * These used to be a swipeable rail on Home, each card in its own currency
 * tint. Two things were wrong with that. Home already showed a total of the
 * same money directly above them, so the rail was the same information a
 * second time; and six pastel grounds in one viewport is a palette, not a
 * hierarchy — the page had no single thing to look at first.
 *
 * So they live here, where "which wallets do I have, and how much is in
 * each" is the actual question, as plain bordered cards on the card surface.
 * The flag is a round chip rather than a bare emoji so every row starts at
 * the same x whatever the glyph's width, and the full currency NAME leads
 * with the code beneath it: "Nigerian Naira" is what someone scans for, and
 * "NGN" is already repeated by the amount beside it.
 */
function WalletCard({ wallet }: { wallet: Wallet }) {
  const meta = currencyMeta(wallet.currency);
  const locked = isWalletLocked(wallet.currency);

  const content = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-lg leading-none"
        >
          {meta.flag}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{meta.label}</span>
          <span className="block text-xs text-muted-foreground">{wallet.currency}</span>
        </span>
        {locked && <MaintenanceBadge className="shrink-0" />}
      </span>

      <span className="shrink-0 text-base text-foreground">
        <Amount currency={wallet.currency} amount={wallet.balance} />
      </span>
    </>
  );

  const className =
    "flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3";

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
  const ordered = [...wallets].sort((a, b) => orderIndex(a.currency) - orderIndex(b.currency));

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {ordered.map((wallet) => (
        <li key={wallet.currency}>
          <WalletCard wallet={wallet} />
        </li>
      ))}
    </ul>
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

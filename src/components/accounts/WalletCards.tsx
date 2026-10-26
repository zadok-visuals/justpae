import Link from "next/link";
import { Amount } from "@/components/ui/Amount";
import { CURRENCIES, currencyMeta, formatAmount } from "@/lib/currencies";
import { walletLockLabel } from "@/lib/ui/currencyPicker";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Currency, Wallet } from "@/lib/types/database";

/**
 * Wallet balances, on /accounts.
 *
 * GROUP — A SQUARE GRID, so wallets read as a set of accounts rather than a
 * continuation of the list below them. A single-column row of cards and a
 * single-column list of recent transactions, stacked, were the same shape
 * twice in a row; nothing told the eye where one question ("what do I hold")
 * ended and the next ("what happened recently") began.
 *
 * The flag leads, on its own line, because a flag is the fastest thing to
 * recognise in a grid read at a glance — the full currency name underneath
 * it is what someone reads second, to confirm.
 */
function WalletCard({ wallet }: { wallet: Wallet }) {
  const meta = currencyMeta(wallet.currency);
  // GROUP 1c. "Soon" for every locked wallet now — the dollar wallet, which
  // has never opened, and cedis, whose rails exist and are down.
  const lockLabel = walletLockLabel(wallet.currency);
  const locked = lockLabel !== null;

  const content = (
    <>
      {lockLabel && <StatusBadge className="absolute right-2 top-2" />}

      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-lg leading-none"
      >
        {meta.flag}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{meta.label}</span>
        <span className="block text-xs text-muted-foreground">{wallet.currency}</span>
        <span className="mt-1 block text-sm text-foreground">
          <Amount currency={wallet.currency} amount={wallet.balance} />
        </span>
      </span>
    </>
  );

  const className =
    "relative flex aspect-square flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4";

  // GROUP 2b. A locked wallet (USD, GHS while their flag is off) shows the
  // same card but is not a link — there is nowhere useful to send a tap, and
  // a card that looks tappable and does nothing is worse than one that is
  // honestly not a button.
  if (locked) {
    return (
      <div
        aria-label={`${meta.label} account, ${lockLabel}, balance ${formatAmount(wallet.currency, wallet.balance)}`}
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
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
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

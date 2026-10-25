import Link from "next/link";
import { ChevronRightIcon } from "@/components/layout/NavIcons";
import { CURRENCIES, currencyMeta } from "@/lib/currencies";
import type { Currency, Wallet } from "@/lib/types/database";

/**
 * GROUP 3e — wallets as ONE row, not a rail of cards.
 *
 * Home used to carry a swipeable rail of balances directly under a total of
 * the same money, which is the same information twice: the figure that
 * matters is already on the blue card, and the rail only answered "which
 * wallets do I have" — a question worth one line and a tap through to
 * /accounts, where the balances properly live.
 *
 * Up to three overlapping flags stand in for the list. Three because a
 * fourth stops reading as a stack and starts reading as a row of icons.
 */
export function WalletsRow({ wallets }: { wallets: Wallet[] }) {
  const ordered = [...wallets].sort((a, b) => orderIndex(a.currency) - orderIndex(b.currency));
  const flags = ordered.slice(0, 3);
  const count = ordered.length;

  return (
    <Link
      href="/accounts"
      className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <span aria-hidden="true" className="flex shrink-0 items-center">
        {flags.map((wallet, index) => (
          <span
            key={wallet.currency}
            className={`flex size-7 items-center justify-center rounded-full border border-card bg-secondary text-sm leading-none ${
              index === 0 ? "" : "-ml-2"
            }`}
          >
            {currencyMeta(wallet.currency).flag}
          </span>
        ))}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">Your wallets</span>
        <span className="block text-xs text-muted-foreground">
          {count} {count === 1 ? "account" : "accounts"}
        </span>
      </span>

      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

const ORDER: Currency[] = CURRENCIES.map((c) => c.code);
function orderIndex(currency: Currency): number {
  const index = ORDER.indexOf(currency);
  return index === -1 ? ORDER.length : index;
}

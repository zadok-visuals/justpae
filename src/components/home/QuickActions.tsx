import Link from "next/link";
import {
  ReceiveIcon,
  ConvertIcon,
  WithdrawIcon,
  BillsIcon,
  AirtimeIcon,
  SendIcon,
} from "@/components/layout/NavIcons";
import { AddMoneyMenu, type AddMoneyChoice } from "@/components/home/AddMoneyMenu";
import { depositAvailability } from "@/lib/deposits/availability";
import { USD_COLLECTION_ENABLED, BILLS_ENABLED } from "@/lib/flags";
import { CURRENCIES } from "@/lib/currencies";
import type { Wallet } from "@/lib/types/database";

const COLUMN_CLASS: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-6",
};

/**
 * The things people come here to do, one tap from Home.
 *
 * WHAT CHANGED AND WHY. This row used to advertise five actions regardless of
 * whether any of them worked. "Receive" led to a coming-soon page, and "Bills"
 * and "Airtime" led to screens behind a provider that has not been chosen —
 * three of five tiles were dead ends, which is how a user learns to stop
 * trusting the row. Each is now shown only when its flag is on, and the flags
 * ship off, so what is on screen is what can be done.
 *
 * Add money replaces Receive as the first tile because it is the thing most
 * people are actually here for, and it asks which wallet before navigating —
 * see AddMoneyMenu.
 *
 * Pay to China is here unconditionally, and that is deliberate rather than an
 * oversight about the flags above. It is not behind an unchosen provider — a
 * human settles it — so it works for every account from the moment it ships.
 * A user with no yuan can still fund one from naira, shillings or USDT, which
 * is most of the point of it.
 */
export function QuickActions({ wallets }: { wallets: Wallet[] }) {
  // Config order, so the sheet does not reshuffle between loads.
  const order = CURRENCIES.map((c) => c.code);
  const choices: AddMoneyChoice[] = [...wallets]
    .sort((a, b) => order.indexOf(a.currency) - order.indexOf(b.currency))
    .map((wallet) => {
      // USD is funded by being sent to, not by depositing — the same split the
      // account pages make, from the same availability module.
      if (wallet.currency === "USD") {
        return {
          currency: wallet.currency,
          href: "/receive",
          disabledReason: USD_COLLECTION_ENABLED
            ? null
            : "Dollar receiving details are coming soon.",
        };
      }
      const availability = depositAvailability(wallet.currency);
      return {
        currency: wallet.currency,
        href: `/deposit?currency=${wallet.currency}`,
        disabledReason: availability.available ? null : availability.reason,
      };
    });

  const links = [
    { href: "/convert", label: "Convert", Icon: ConvertIcon },
    { href: "/pay-to-china", label: "Pay to China", Icon: SendIcon },
    { href: "/withdraw", label: "Withdraw", Icon: WithdrawIcon },
    ...(USD_COLLECTION_ENABLED
      ? [{ href: "/receive", label: "Receive USD", Icon: ReceiveIcon }]
      : []),
    ...(BILLS_ENABLED
      ? [
          { href: "/bills", label: "Bills", Icon: BillsIcon },
          { href: "/bills/airtime", label: "Airtime", Icon: AirtimeIcon },
        ]
      : []),
  ];

  // The grid tracks the real number of tiles rather than a hardcoded five —
  // with the flags off that left two empty columns and three tiles stranded
  // at the left edge of a desktop screen. Written as whole literal class
  // names because Tailwind scans source text: a template-built `sm:grid-cols-
  // ${n}` produces no CSS at all.
  const columnClass = COLUMN_CLASS[links.length + 1] ?? "sm:grid-cols-3";

  return (
    <div
      className={`snap-rail -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:px-0 ${columnClass}`}
    >
      <AddMoneyMenu choices={choices} />

      {links.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex min-w-[4.5rem] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-3 text-xs font-medium text-foreground sm:min-w-0"
        >
          <span className="text-primary">
            <Icon className="size-6" />
          </span>
          {label}
        </Link>
      ))}
    </div>
  );
}

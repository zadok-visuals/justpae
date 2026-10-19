import Link from "next/link";
import {
  ReceiveIcon,
  ConvertIcon,
  WithdrawIcon,
  BillsIcon,
  AirtimeIcon,
  SendIcon,
  FlightsIcon,
} from "@/components/layout/NavIcons";
import { AddMoneyMenu, type AddMoneyChoice } from "@/components/home/AddMoneyMenu";
import { depositAvailability } from "@/lib/deposits/availability";
import { USD_COLLECTION_ENABLED, BILLS_ENABLED, FLIGHTS_ENABLED } from "@/lib/flags";
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
 * trusting the row.
 *
 * The rule that replaced it was "show a tile only when its flag is on".
 * Group 4e refines it rather than reverting it: a tile is shown when it
 * leads somewhere that TELLS THE TRUTH, which is now the case for Bills and
 * Flights and is still not the case for Receive USD. So those two are
 * always present with a maintenance marker, and Receive USD stays flagged.
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

  // GROUP 4e. Bills and Flights are now always here, carrying a Maintenance
  // badge while their flags are off, instead of vanishing.
  //
  // This reverses the earlier call deliberately, and the reason the earlier
  // call was right does not apply any more. Hiding them was right when the
  // destination was a bare "coming soon" page — a tile that leads nowhere
  // teaches people to stop trusting the row. Both destinations now explain
  // themselves, take no provider call, and offer a way to be told when they
  // open. A labelled Maintenance tile is information; an absent tile is a
  // user concluding justpae does not do bills at all.
  //
  // Airtime does NOT get its own tile any more. It did when Bills was
  // live-or-hidden, as the single most common bill; promoting one
  // maintenance sub-page to the top level while its parent is also down is
  // two tiles saying the same thing.
  const links = [
    { href: "/convert", label: "Convert", Icon: ConvertIcon, maintenance: false },
    { href: "/pay-to-china", label: "Pay to China", Icon: SendIcon, maintenance: false },
    { href: "/withdraw", label: "Withdraw", Icon: WithdrawIcon, maintenance: false },
    ...(USD_COLLECTION_ENABLED
      ? [{ href: "/receive", label: "Receive USD", Icon: ReceiveIcon, maintenance: false }]
      : []),
    ...(BILLS_ENABLED
      ? [
          { href: "/bills", label: "Bills", Icon: BillsIcon, maintenance: false },
          { href: "/bills/airtime", label: "Airtime", Icon: AirtimeIcon, maintenance: false },
        ]
      : [{ href: "/bills", label: "Bills", Icon: BillsIcon, maintenance: true }]),
    { href: "/flights", label: "Flights", Icon: FlightsIcon, maintenance: !FLIGHTS_ENABLED },
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

      {links.map(({ href, label, Icon, maintenance }) => (
        <Link
          key={href}
          href={href}
          className="relative flex min-w-[4.5rem] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-3 text-xs font-medium text-foreground sm:min-w-0"
        >
          <span className={maintenance ? "text-muted-foreground" : "text-primary"}>
            <Icon className="size-6" />
          </span>
          {label}
          {/* A dot rather than the full badge: these tiles are 72px wide on a
              phone and the word "Maintenance" does not fit in one. The
              accessible name below carries the actual word, so nothing is
              conveyed by colour alone. */}
          {maintenance && (
            <>
              <span
                aria-hidden="true"
                className="absolute right-2 top-2 size-2 rounded-full bg-muted-foreground"
              />
              <span className="sr-only">— under maintenance</span>
            </>
          )}
        </Link>
      ))}
    </div>
  );
}

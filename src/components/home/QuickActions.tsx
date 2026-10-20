import { SendIcon, BillsIcon, AirtimeIcon, FlightsIcon, ReceiveIcon } from "@/components/layout/NavIcons";
import { AddMoneyMenu, type AddMoneyChoice } from "@/components/home/AddMoneyMenu";
import { QuickActionLink } from "@/components/home/QuickActionTile";
import { MaintenanceQuickAction } from "@/components/home/MaintenanceQuickAction";
import { depositAvailability } from "@/lib/deposits/availability";
import { isServiceLive } from "@/lib/services";
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
 * GROUP 3a. Convert and Withdraw are gone from this row — both stay reachable
 * from the sidebar, the bottom bar and every account page's own action row,
 * which is where a user already holding a currency goes to do something with
 * it. This row is for the one thing that starts with nothing in hand: getting
 * money in. "Add money" is renamed "Deposit" for the same reason — the
 * account page action row and /deposit's own title say the same word now,
 * so a user following any of the three paths in sees one name for the thing
 * they are about to do, not three.
 *
 * Pay to China is here unconditionally: it is not behind an unchosen
 * provider — a human settles it — so it works for every account from the
 * moment it ships, and a user with no yuan can still fund one from naira,
 * shillings or USDT.
 *
 * Receive USD, Bills and Flights stay VISIBLE while their service is off
 * (src/lib/services.ts), carrying a Maintenance badge and a toast instead of
 * a destination — the page behind each one now redirects straight back
 * (GROUP 2c), so an absent tile would be the only honest alternative, and
 * that teaches a user justpae does not do the thing at all.
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
          disabledReason: isServiceLive("receiveUsd")
            ? null
            : "Dollar receiving details are under maintenance.",
        };
      }
      const availability = depositAvailability(wallet.currency);
      return {
        currency: wallet.currency,
        href: `/deposit?currency=${wallet.currency}`,
        disabledReason: availability.available ? null : availability.reason,
      };
    });

  const billsLive = isServiceLive("bills");

  // Rendered up front so the tile count (and so the grid's column class)
  // reflects exactly what ends up on screen.
  const tiles: React.ReactElement[] = [
    <QuickActionLink key="pay-to-china" href="/pay-to-china" label="Pay to China" Icon={SendIcon} />,
    isServiceLive("receiveUsd") ? (
      <QuickActionLink key="receive" href="/receive" label="Receive USD" Icon={ReceiveIcon} />
    ) : (
      <MaintenanceQuickAction key="receive" label="Receive USD" Icon={ReceiveIcon} />
    ),
    ...(billsLive
      ? [
          <QuickActionLink key="bills" href="/bills" label="Bills" Icon={BillsIcon} />,
          <QuickActionLink key="airtime" href="/bills/airtime" label="Airtime" Icon={AirtimeIcon} />,
        ]
      : [<MaintenanceQuickAction key="bills" label="Bills" Icon={BillsIcon} />]),
    isServiceLive("flights") ? (
      <QuickActionLink key="flights" href="/flights" label="Flights" Icon={FlightsIcon} />
    ) : (
      <MaintenanceQuickAction key="flights" label="Flights" Icon={FlightsIcon} />
    ),
  ];

  // +1 for the Deposit tile, which isn't in the array above. Written as
  // whole literal class names because Tailwind scans source text: a
  // template-built `sm:grid-cols-${n}` produces no CSS at all.
  const columnClass = COLUMN_CLASS[tiles.length + 1] ?? "sm:grid-cols-3";

  return (
    <div
      className={`snap-rail -mx-4 flex items-stretch gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:px-0 ${columnClass}`}
    >
      <AddMoneyMenu choices={choices} />
      {tiles}
    </div>
  );
}

import { SendIcon, BillsIcon, AirtimeIcon, FlightsIcon, ReceiveIcon } from "@/components/layout/NavIcons";
import { AddMoneyMenu, type AddMoneyChoice } from "@/components/home/AddMoneyMenu";
import { QuickActionLink, QUICK_ACTION_WRAPPER_CLASS } from "@/components/home/QuickActionTile";
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
  // Config order first, so the sheet does not reshuffle between loads; then
  // a stable sort puts every currency you can actually fund today ahead of
  // the ones that are under maintenance or need a detour through convert —
  // the choice that's one tap away belongs above the ones that are not.
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
    })
    .sort((a, b) => Number(a.disabledReason !== null) - Number(b.disabledReason !== null));

  const billsLive = isServiceLive("bills");

  // Rendered up front so the tile count (and so the grid's column class)
  // reflects exactly what ends up on screen. Each entry names a stable key
  // and builds its own element; wrapping happens once below in
  // QUICK_ACTION_WRAPPER_CLASS — the same wrapper AddMoneyMenu already gives
  // its own Deposit tile. Without it, a tile sits as a DIRECT flex/grid
  // child, and TILE_CLASS's `w-full` then resolves against the whole row
  // instead of one cell: on mobile's flex rail that stretched the tile to
  // fill all remaining space (pushing its neighbours off-screen), and on the
  // desktop grid it was implicated in the Deposit popover's layout breaking
  // too.
  const tileEntries: { key: string; element: React.ReactElement }[] = [
    {
      key: "pay-to-china",
      element: <QuickActionLink href="/pay-to-china" label="Pay to China" icon={<SendIcon className="size-6" />} />,
    },
    {
      key: "receive",
      element: isServiceLive("receiveUsd") ? (
        <QuickActionLink href="/receive" label="Receive USD" icon={<ReceiveIcon className="size-6" />} />
      ) : (
        <MaintenanceQuickAction label="Receive USD" icon={<ReceiveIcon className="size-6" />} />
      ),
    },
    ...(billsLive
      ? [
          {
            key: "bills",
            element: <QuickActionLink href="/bills" label="Bills" icon={<BillsIcon className="size-6" />} />,
          },
          {
            key: "airtime",
            element: (
              <QuickActionLink href="/bills/airtime" label="Airtime" icon={<AirtimeIcon className="size-6" />} />
            ),
          },
        ]
      : [
          {
            key: "bills",
            element: <MaintenanceQuickAction label="Bills" icon={<BillsIcon className="size-6" />} />,
          },
        ]),
    {
      key: "flights",
      element: isServiceLive("flights") ? (
        <QuickActionLink href="/flights" label="Flights" icon={<FlightsIcon className="size-6" />} />
      ) : (
        <MaintenanceQuickAction label="Flights" icon={<FlightsIcon className="size-6" />} />
      ),
    },
  ];

  const tiles = tileEntries.map(({ key, element }) => (
    <div key={key} className={QUICK_ACTION_WRAPPER_CLASS}>
      {element}
    </div>
  ));

  // +1 for the Deposit tile, which isn't in the array above. Written as
  // whole literal class names because Tailwind scans source text: a
  // template-built `sm:grid-cols-${n}` produces no CSS at all.
  const columnClass = COLUMN_CLASS[tiles.length + 1] ?? "sm:grid-cols-3";

  return (
    <div
      // sm:overflow-visible matters beyond tidiness: overflow-x-auto with no
      // overflow-y set computes overflow-y to auto too (CSS Overflow §3), so
      // without this the desktop grid stayed a scroll container — clipping
      // AddMoneyMenu's absolutely-positioned popover, which escapes clipping
      // on mobile only because it's `fixed` there instead of `absolute`.
      className={`snap-rail -mx-4 flex items-stretch gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 ${columnClass}`}
    >
      <AddMoneyMenu choices={choices} />
      {tiles}
    </div>
  );
}

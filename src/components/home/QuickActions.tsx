import { SendIcon, BillsIcon, AirtimeIcon, FlightsIcon, ReceiveIcon } from "@/components/layout/NavIcons";
import { AddMoneyMenu, type AddMoneyChoice } from "@/components/home/AddMoneyMenu";
import { QuickActionLink, QUICK_ACTION_WRAPPER_CLASS } from "@/components/home/QuickActionTile";
import { MaintenanceQuickAction } from "@/components/home/MaintenanceQuickAction";
import { MoreActionsSheet, type MoreAction } from "@/components/home/MoreActionsSheet";
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
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GROUP 6 — MOBILE GETS A DIFFERENT SHAPE, NOT A SCALED-DOWN ONE
 *
 * This used to be one scrollable rail at every width, grid at sm+. On a
 * phone that meant five or six equal tiles in a row nobody could see all of
 * at once — the ones past the fold were reachable only by swiping, and nobody
 * swiped a row that doesn't visually hint it continues.
 *
 * So mobile now shows exactly three tiles, always, and always equal: Deposit,
 * Pay to China — the two things used from zero — and More, which opens
 * everything else in the same bottom sheet AddMoneyMenu already uses for
 * "which wallet". Nothing is hidden, nothing needs a swipe, and the row's
 * width never depends on how many services happen to be live today.
 *
 * Desktop keeps the plain grid: there is room to show every tile directly,
 * so a "More" button there would just be an extra tap to the same content.
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
  const receiveLive = isServiceLive("receiveUsd");
  const flightsLive = isServiceLive("flights");

  // One list of what "the rest" of the row is, read two ways below: as
  // rendered grid tiles for desktop, and as plain data for the mobile More
  // sheet. Keeping a single source is what stops the two from ever disagreeing
  // about which services are live.
  const restEntries: { key: string; label: string; icon: React.ReactElement; href: string | null }[] = [
    { key: "receive", label: "Receive USD", icon: <ReceiveIcon className="size-6" />, href: receiveLive ? "/receive" : null },
    ...(billsLive
      ? [
          { key: "bills", label: "Bills", icon: <BillsIcon className="size-6" />, href: "/bills" },
          { key: "airtime", label: "Airtime", icon: <AirtimeIcon className="size-6" />, href: "/bills/airtime" },
        ]
      : [{ key: "bills", label: "Bills", icon: <BillsIcon className="size-6" />, href: null }]),
    { key: "flights", label: "Flights", icon: <FlightsIcon className="size-6" />, href: flightsLive ? "/flights" : null },
  ];

  const moreActions: MoreAction[] = restEntries.map(({ key, label, icon, href }) => ({
    key,
    label,
    icon,
    href: href ?? undefined,
  }));

  const payToChina = <QuickActionLink href="/pay-to-china" label="Pay to China" icon={<SendIcon className="size-6" />} />;

  // The tiles desktop shows beyond Deposit and Pay to China, each wrapped in
  // QUICK_ACTION_WRAPPER_CLASS — the same wrapper AddMoneyMenu gives its own
  // Deposit tile — because a tile as a DIRECT grid child lets TILE_CLASS's
  // `w-full` resolve against the whole row instead of one cell.
  const restTiles = restEntries.map(({ key, label, icon, href }) => (
    <div key={key} className={QUICK_ACTION_WRAPPER_CLASS}>
      {href ? <QuickActionLink href={href} label={label} icon={icon} /> : <MaintenanceQuickAction label={label} icon={icon} />}
    </div>
  ));

  // Deposit + Pay to China + every rest tile. Written as whole literal class
  // names because Tailwind scans source text: a template-built
  // `sm:grid-cols-${n}` produces no CSS at all.
  const columnClass = COLUMN_CLASS[restTiles.length + 2] ?? "sm:grid-cols-3";

  return (
    // One grid, not two separately mounted layouts: AddMoneyMenu keeps a
    // single `open` state either way. grid-cols-3 is the MOBILE shape —
    // Deposit, Pay to China, More, always exactly three, never a scroll —
    // and sm:grid-cols-N below replaces it once there is room to show every
    // tile directly instead of behind More.
    <div className={`grid grid-cols-3 gap-2 ${columnClass}`}>
      <AddMoneyMenu choices={choices} />

      <div className={`${QUICK_ACTION_WRAPPER_CLASS} sm:hidden`}>{payToChina}</div>
      <MoreActionsSheet actions={moreActions} />

      {/* display:contents on the wrapper, not on the tiles: this group needs
          to disappear from mobile's 3-column grid as a whole (hidden), and
          at sm+ hand its children straight to the outer grid as ordinary
          items (contents) rather than becoming one grid cell itself. */}
      <div className="hidden sm:contents">
        <div className={QUICK_ACTION_WRAPPER_CLASS}>{payToChina}</div>
        {restTiles}
      </div>
    </div>
  );
}

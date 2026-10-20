"use client";

import Link from "next/link";
import { useState } from "react";
import { SheetPanel } from "@/components/ui/SheetPanel";
import { DepositIcon, ConvertIcon, SendIcon, WithdrawIcon } from "@/components/layout/NavIcons";
import { UnavailableBadge } from "@/components/ui/MaintenanceBadge";
import { UNAVAILABLE_LABEL } from "@/lib/ui/unavailability";
import type { AccountAction, AccountActionKey } from "@/lib/accounts/actions";

/**
 * GROUP 4c — the things you can do with one wallet, as a row of round icon
 * buttons under the balance.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACED
 *
 * A vertical list of four full-width bordered cards, each 64px tall with the
 * label on one line and either a reason or "Continue →" on the next. Four of
 * them stacked came to roughly 280px — so on a phone the actions pushed the
 * balance off the top of the screen and the recent activity below the fold,
 * and the page read as a form rather than as an account.
 *
 * Every banking app converges on the same answer for a reason: a short row of
 * round icon buttons directly beneath the balance, labelled underneath. It is
 * scannable in one glance, it is thumb-reachable, and it keeps the balance —
 * the thing the page exists to show — at the top where it belongs.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * A DISABLED ACTION IS STILL VISIBLE, AND STILL EXPLAINED
 *
 * The rule the previous version established and this one keeps. Dropping
 * "Add money" off the cedi page would leave a Ghanaian user with no way to
 * tell whether the product cannot do it, has not built it, or has hidden it
 * from them specifically. The button stays, muted, and the reason is one tap
 * away.
 *
 * WHY THE REASON IS A SHEET AND NOT A TOOLTIP. A tooltip does not exist on a
 * touchscreen, and this is a product whose users are overwhelmingly on one.
 * The old layout solved that by printing the reason inside every tile, which
 * works for a tall card and cannot work under a 56px circle. So the muted
 * button is a real <button> that opens a sheet carrying the sentence — and,
 * crucially, it is announced as a button rather than as something inert,
 * because there genuinely IS something to press.
 *
 * The enabled buttons stay links. A disabled-looking <a> with no href is
 * invisible to keyboard navigation; a <button> that navigates is a link
 * pretending otherwise. Each is the element it actually is.
 */

const ICONS: Record<AccountActionKey, (props: { className?: string }) => React.ReactElement> = {
  add: DepositIcon,
  convert: ConvertIcon,
  payToChina: SendIcon,
  withdraw: WithdrawIcon,
};

/**
 * The row's own order, independent of the order the rules module happens to
 * build them in. Add money first because it is what most people arrive for;
 * Withdraw last because it is the one with consequences.
 */
const ORDER: AccountActionKey[] = ["add", "convert", "payToChina", "withdraw"];

/**
 * Short labels. The row has four columns on a 375px screen, so "Convert NGN"
 * and "Pay to China" cannot both be read at full length — the long form is
 * kept as the button's accessible name, where there is no width limit.
 */
const SHORT_LABEL: Record<AccountActionKey, string> = {
  // GROUP 3a. "Deposit" everywhere this action is named — Home's quick
  // action, this row, and /deposit's own title — one word, not three.
  add: "Deposit",
  convert: "Convert",
  payToChina: "Pay to China",
  withdraw: "Withdraw",
};

export function AccountActions({ actions }: { actions: AccountAction[] }) {
  const [explaining, setExplaining] = useState<AccountAction | null>(null);

  const ordered = [...actions].sort(
    (a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key),
  );

  // A note on an ENABLED action — "your yuan is bought as the payment goes
  // out" — belongs under the row, not inside a 56px circle. It must never
  // REPLACE the action's link, which is why it is rendered here as a
  // sibling of the row rather than in place of anything in it.
  const notes = ordered.filter((action) => action.disabledReason === null && action.note);

  return (
    <div>
      <ul className="flex items-start justify-between gap-1 sm:justify-start sm:gap-4">
        {ordered.map((action) => {
          const Icon = ICONS[action.key];
          const label = SHORT_LABEL[action.key];
          const disabled = action.disabledReason !== null;

          // The circle, identical in both branches so an unavailable action
          // keeps its place in the row rather than the row reflowing.
          const circle = (
            <span
              className={`flex size-14 items-center justify-center rounded-full border transition-colors ${
                disabled
                  ? "border-dashed border-border bg-secondary/40 text-muted-foreground"
                  : "border-border bg-card text-primary group-hover:border-primary/50 group-hover:bg-sidebar-accent group-active:scale-95"
              }`}
            >
              <Icon className="size-6" />
            </span>
          );

          const caption = (
            <>
              <span
                className={`mt-1.5 block text-center text-[0.6875rem] font-medium leading-tight ${
                  disabled ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {label}
              </span>
              {/* GROUP 4f — the state, at a glance.
                  A muted circle on its own says "no" and nothing else, so a
                  cedi holder had to tap to learn the difference between "down
                  this week" and "never". The word goes UNDER the label rather
                  than on the circle: 56px has no room for it, and the badge
                  must not shrink the icon or push the row out of alignment.
                  `aria-hidden` because the button's own accessible name below
                  already carries the same word — announcing it twice is noise.
                  Still a tap away: the sheet has the full sentence. */}
              {disabled && action.disabledKind && (
                <span aria-hidden="true" className="mt-1 flex justify-center">
                  <UnavailableBadge
                    kind={action.disabledKind}
                    className="max-w-full truncate text-[0.625rem]"
                  />
                </span>
              )}
            </>
          );

          return (
            <li key={action.key} className="min-w-0 flex-1 sm:flex-none">
              {disabled ? (
                <button
                  type="button"
                  onClick={() => setExplaining(action)}
                  // NOT `disabled`, and not aria-disabled either: this button
                  // does something. The muting is visual, the behaviour is
                  // real, and a screen-reader user is told what it is.
                  //
                  // GROUP 4f: and told WHICH state, not "unavailable". A
                  // screen-reader user was the one person on this screen who
                  // could not see the muting and got the least specific
                  // wording of anybody.
                  aria-label={
                    action.disabledKind
                      ? `${action.label} — ${UNAVAILABLE_LABEL[
                          action.disabledKind
                        ].toLowerCase()}. Tap to find out why.`
                      : `${action.label} — unavailable. Tap to find out why.`
                  }
                  className="group flex w-full flex-col items-center focus-visible:outline-none"
                >
                  {circle}
                  {caption}
                </button>
              ) : (
                <Link
                  href={action.href}
                  aria-label={action.label}
                  className="group flex w-full flex-col items-center focus-visible:outline-none"
                >
                  {circle}
                  {caption}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {notes.map((action) => (
        <p key={action.key} className="mt-3 text-xs text-muted-foreground">
          {action.note}
        </p>
      ))}

      {/* The one-line reason, in the small sheet the brief asks for. Its own
          `note`, when it has one, comes with it — a blocked action can still
          have something worth knowing attached. */}
      <SheetPanel
        open={explaining !== null}
        onClose={() => setExplaining(null)}
        title={explaining?.label ?? ""}
      >
        {explaining?.disabledKind && (
          <p className="mb-2">
            <UnavailableBadge kind={explaining.disabledKind} />
          </p>
        )}
        <p className="text-sm text-muted-foreground">{explaining?.disabledReason}</p>
        {explaining?.note && (
          <p className="mt-2 text-sm text-muted-foreground">{explaining.note}</p>
        )}
      </SheetPanel>
    </div>
  );
}

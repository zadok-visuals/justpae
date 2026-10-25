"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronRightIcon, EyeIcon, EyeOffIcon } from "@/components/layout/NavIcons";
import { Amount } from "@/components/ui/Amount";
import { setAmountsHidden, setDisplayCurrency } from "@/lib/actions/homePrefs";
import type { DisplayCurrency } from "@/lib/home/totals";
import type { Currency } from "@/lib/types/database";

export interface TotalBalanceView {
  /** Totalled on the SERVER, where the rates live; only the figure crosses. */
  currency: Currency;
  amount: number;
  approx: boolean;
  /** Currencies left out because they are locked or could not be priced. */
  excluded: string[];
}

/**
 * The headline figure, on the one solid-colour panel in the product.
 *
 * GROUP 3b — a royal blue card rather than a bordered white one. It is the
 * single piece of brand colour on Home and the thing the eye should land on
 * first; everything under it is white with a border, so the hierarchy is
 * carried by the one filled surface rather than by six competing tints. Flat
 * fill, no gradient, no shadow, no border.
 *
 * Both currencies are computed on the SERVER and handed over together, so
 * the switcher is instant and no rate ever reaches the browser. Hiding is a
 * local toggle for the same reason the theme toggle is: the write is the
 * memory, not the mechanism.
 *
 * "approx." appears only when the figure actually includes a converted
 * balance — see totals.ts.
 *
 * THE SWITCHER IS A TOGGLE, NOT A RADIO GROUP. There are exactly two options
 * and the card has to stay readable at 360px beside a Deposit button; a
 * segmented control for a binary choice spends twice the width to say the
 * same thing. The chevron marks it as something that changes, and the label
 * always names what is on screen now.
 */
export function TotalBalanceCard({
  local,
  usdt,
  localLabel,
  initialDisplay,
  initialHidden,
  depositHref = "/deposit",
}: {
  /** Null when the local pair cannot be priced; the switcher is then hidden. */
  local: TotalBalanceView | null;
  usdt: TotalBalanceView;
  localLabel: string;
  initialDisplay: DisplayCurrency;
  initialHidden: boolean;
  depositHref?: string;
}) {
  const [display, setDisplay] = useState<DisplayCurrency>(
    local == null ? "usdt" : initialDisplay,
  );
  const [hidden, setHidden] = useState(initialHidden);
  const [, startTransition] = useTransition();

  const view = display === "local" && local ? local : usdt;
  const excluded = view.excluded;

  function toggleDisplay() {
    if (!local) return;
    const next: DisplayCurrency = display === "local" ? "usdt" : "local";
    setDisplay(next);
    startTransition(() => void setDisplayCurrency(next));
  }

  function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    startTransition(() => void setAmountsHidden(next));
  }

  return (
    <section className="rounded-[20px] bg-balance-card p-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[0.8125rem] leading-tight text-white/80">Total balance</span>

            {local && (
              <button
                type="button"
                onClick={toggleDisplay}
                aria-label={`Showing ${view.currency}. Switch to ${
                  display === "local" ? "USDT" : localLabel
                }`}
                className="inline-flex items-center gap-0.5 rounded-full bg-white/20 py-0.5 pl-2 pr-1 text-[0.6875rem] font-semibold text-white transition-colors hover:bg-white/30"
              >
                {display === "local" ? localLabel : "USDT"}
                <ChevronRightIcon className="size-3 rotate-90" />
              </button>
            )}
          </div>

          {/* `flex-wrap` and no negative margin on the button. A seven-figure
              naira balance at 28px is already most of a 360px card, and
              pulling the eye back over it with `-m-2` put the icon on top of
              the decimals. It drops to its own line instead of colliding. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-0.5">
            <span className="text-[1.75rem] leading-none sm:text-[2rem]">
              <Amount
                currency={view.currency}
                amount={view.amount}
                hidden={hidden}
                codeClassName="text-white/80"
              />
            </span>
            <button
              type="button"
              onClick={toggleHidden}
              aria-pressed={hidden}
              aria-label={hidden ? "Show amounts" : "Hide amounts"}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white"
            >
              {hidden ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
            </button>
          </div>

          {!hidden && view.approx && (
            <p className="mt-1.5 text-xs text-white/80">approx. at today&apos;s rates</p>
          )}

          {!hidden && excluded.length > 0 && (
            <p className="mt-1 text-xs text-white/80">
              {excluded.join(", ")} {excluded.length === 1 ? "is" : "are"} not included
            </p>
          )}
        </div>

        <Link
          href={depositHref}
          // `text-primary-fill`, not `text-primary`: on white, the dark
          // theme's #5B7CFF is 3.64:1 and fails for a 14px label. See the
          // note at the top of globals.css.
          className="inline-flex h-10 shrink-0 items-center rounded-full bg-white px-4 text-sm font-semibold text-primary-fill transition-colors hover:bg-white/90"
        >
          + Deposit
        </Link>
      </div>
    </section>
  );
}

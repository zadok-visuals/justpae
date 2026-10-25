"use client";

import { useState, useTransition } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/layout/NavIcons";
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
 * The headline figure.
 *
 * Both currencies are computed on the SERVER and handed over together, so
 * the switcher is instant and no rate ever reaches the browser. Hiding is a
 * local toggle for the same reason the theme toggle is: the write is the
 * memory, not the mechanism.
 *
 * "approx." appears only when the figure actually includes a converted
 * balance — see totals.ts.
 */
export function TotalBalanceCard({
  local,
  usdt,
  localLabel,
  initialDisplay,
  initialHidden,
}: {
  /** Null when the local pair cannot be priced; the switcher then has one option. */
  local: TotalBalanceView | null;
  usdt: TotalBalanceView;
  localLabel: string;
  initialDisplay: DisplayCurrency;
  initialHidden: boolean;
}) {
  const [display, setDisplay] = useState<DisplayCurrency>(
    local == null ? "usdt" : initialDisplay,
  );
  const [hidden, setHidden] = useState(initialHidden);
  const [, startTransition] = useTransition();

  const view = display === "local" && local ? local : usdt;
  const excluded = view.excluded;

  function choose(next: DisplayCurrency) {
    if (next === display) return;
    setDisplay(next);
    startTransition(() => void setDisplayCurrency(next));
  }

  function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    startTransition(() => void setAmountsHidden(next));
  }

  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-5 text-center">
      <div className="flex items-center justify-center gap-2">
        <span className="inline-flex items-center rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
          Total balance
        </span>

        {local && (
          <div
            role="radiogroup"
            aria-label="Display currency"
            className="inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5"
          >
            {([
              ["local", localLabel],
              ["usdt", "USDT"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={display === value}
                onClick={() => choose(value)}
                className={`min-h-7 rounded-full px-2.5 text-xs font-medium transition-colors ${
                  display === value
                    ? "bg-card text-foreground border border-border"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={toggleHidden}
          aria-pressed={hidden}
          aria-label={hidden ? "Show amounts" : "Hide amounts"}
          className="-m-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          {hidden ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
        </button>
      </div>

      <p className="mt-3 text-4xl text-foreground">
        <Amount currency={view.currency} amount={view.amount} hidden={hidden} />
      </p>

      {!hidden && view.approx && (
        <p className="mt-1 text-xs text-muted-foreground">approx. at today&apos;s rates</p>
      )}

      {!hidden && excluded.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {excluded.join(", ")} {excluded.length === 1 ? "is" : "are"} not included
        </p>
      )}
    </section>
  );
}

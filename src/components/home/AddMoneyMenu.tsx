"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { DepositIcon } from "@/components/layout/NavIcons";
import { currencyMeta } from "@/lib/currencies";
import type { Currency } from "@/lib/types/database";

export interface AddMoneyChoice {
  currency: Currency;
  /** Where the tap goes. /receive for dollars, /deposit for everything else. */
  href: string;
  /** Null when this currency can be funded. Otherwise the one-line reason. */
  disabledReason: string | null;
}

/**
 * "Add money" on Home, and the currency question it has to ask first.
 *
 * Going straight to /deposit meant landing on a form whose first control was
 * a currency select — so the user picked a currency to get to the screen
 * where they pick a currency. Asking here means the deposit page opens on the
 * wallet they actually meant, with the amount field already the next thing to
 * touch.
 *
 * A SHEET ON MOBILE, A POPOVER ON DESKTOP, and the difference is not
 * decoration. A popover anchored to a tile near the top of a phone screen
 * opens furthest from the thumb and gets dismissed by accident; a full-height
 * panel for a three-item list is absurd on a desktop. Both shapes are the
 * same DOM with different classes — no viewport branching in JS, so no
 * hydration mismatch and no resize listener.
 *
 * Unavailable currencies stay in the list with their reason, for the same
 * reason the account pages keep disabled tiles: a missing option tells
 * somebody holding cedis nothing at all.
 */
export function AddMoneyMenu({ choices }: { choices: AddMoneyChoice[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        // Focus goes back to the tile that opened this, not to the top of the
        // document — otherwise a keyboard user has to tab through Home again.
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative min-w-[4.5rem] shrink-0 sm:min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full min-w-[4.5rem] flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-3 text-xs font-medium text-foreground sm:min-w-0"
      >
        <span className="text-primary">
          <DepositIcon className="size-6" />
        </span>
        Add money
      </button>

      {open && (
        <>
          {/* The scrim is a real button so a keyboard user can reach and
              dismiss it. Opaque on mobile where it is the sheet's backdrop;
              invisible on desktop where it is only a click-catcher. */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="jp-fade-in fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelId}
            tabIndex={-1}
            className={[
              "z-50 border-border bg-card",
              // Mobile: a sheet from the bottom edge, where the thumb is.
              "jp-sheet-in fixed inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t",
              "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]",
              // Desktop: a popover anchored under the tile it came from.
              "sm:absolute sm:inset-x-auto sm:left-0 sm:bottom-auto sm:top-full sm:mt-2 sm:w-72",
              "sm:max-h-none sm:rounded-xl sm:border sm:pb-2 sm:shadow-lg",
            ].join(" ")}
          >
            <p
              id={labelId}
              className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Which wallet?
            </p>

            <ul className="p-2 pt-1">
              {choices.map((choice) => {
                const meta = currencyMeta(choice.currency);
                return (
                  <li key={choice.currency}>
                    {choice.disabledReason ? (
                      <div
                        aria-disabled="true"
                        className="flex min-h-12 flex-col justify-center gap-0.5 rounded-lg px-3 py-2"
                      >
                        <span className="text-sm font-medium text-muted-foreground">
                          {meta.flag} {choice.currency}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {choice.disabledReason}
                        </span>
                      </div>
                    ) : (
                      <Link
                        href={choice.href}
                        onClick={() => setOpen(false)}
                        className="flex min-h-12 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground"
                      >
                        <span aria-hidden="true">{meta.flag}</span>
                        <span>{choice.currency}</span>
                        <span className="truncate text-xs font-normal text-muted-foreground">
                          {meta.label}
                        </span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

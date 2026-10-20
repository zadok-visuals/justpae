"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { DepositIcon } from "@/components/layout/NavIcons";
import { QuickActionButton, QUICK_ACTION_WRAPPER_CLASS } from "@/components/home/QuickActionTile";
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
 * A SHEET ON MOBILE, A CENTERED MODAL ON DESKTOP, and the difference is not
 * decoration. A full-height panel from the bottom edge is where a thumb
 * expects it on a phone; a popover anchored under a tile in the middle of a
 * desktop page is not a "modal" at all — it is still part of the page, so it
 * still takes its place in the page's own layout. GROUP 6 moved away from
 * exactly that: the earlier `position: absolute` popover sat inside the
 * quick-actions row's own box, and opening it grew that box, which read as
 * the whole dashboard shifting just to show four currency names. `position:
 * fixed` at both widths is what actually makes this an overlay — fixed
 * elements are laid out against the viewport, not their scrolling ancestor,
 * so nothing below the trigger ever moves to make room for it.
 *
 * Both shapes are the same DOM with different classes — no viewport
 * branching in JS, so no hydration mismatch and no resize listener.
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
    <div ref={containerRef} className={QUICK_ACTION_WRAPPER_CLASS}>
      <QuickActionButton
        buttonRef={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        label="Deposit"
        icon={<DepositIcon className="size-6" />}
      />

      {open && (
        <>
          {/* The scrim is a real button so a keyboard user can reach and
              dismiss it, and dims the page at every width now — on desktop
              it used to be sm:bg-transparent, which was right for a popover
              that was still part of the page, and wrong for a modal. */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="jp-fade-in fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm"
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
              // Desktop: centered in the viewport. `inset-0` + `m-auto` on a
              // fixed element with an explicit width centers it on both axes
              // without a transform — a native <dialog>'s own default
              // positioning does the same thing — which leaves the entrance
              // animation's transform free instead of fighting a
              // translate(-50%,-50%) that would otherwise need to coexist
              // with it.
              "sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[min(80vh,28rem)] sm:w-full sm:max-w-sm",
              "sm:rounded-xl sm:border sm:pb-2 sm:shadow-xl",
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

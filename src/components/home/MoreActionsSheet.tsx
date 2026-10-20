"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactElement } from "react";
import Link from "next/link";
import { MoreIcon } from "@/components/layout/NavIcons";
import { maintenanceToastFor } from "@/components/ui/maintenanceToast";
import { QuickActionButton, QUICK_ACTION_WRAPPER_CLASS } from "@/components/home/QuickActionTile";

export interface MoreAction {
  key: string;
  label: string;
  icon: ReactElement;
  /** Present when live. Absent means under maintenance — a tap toasts instead. */
  href?: string;
}

/**
 * MOBILE ONLY. QuickActions.tsx keeps a fixed, equal-size row on a phone —
 * Deposit, Pay to China, then this — instead of the old horizontal-scroll
 * rail, where a fifth or sixth tile was reachable only by swiping and nobody
 * swiped. Everything that isn't one of those two headline actions lives
 * here, one tap away, all the same height as the tiles beside it rather
 * than scrolling off the edge of the screen.
 *
 * Not rendered on desktop at all (QuickActions.tsx doesn't mount this
 * outside `sm:hidden`): the grid there already shows every action directly,
 * so there is nothing this would need to hide.
 */
export function MoreActionsSheet({ actions }: { actions: MoreAction[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    // sm:hidden here, not left to the caller to remember: this tile only
    // exists because mobile's row is too narrow to show everything
    // directly, which stops being true at sm+.
    <div className={`${QUICK_ACTION_WRAPPER_CLASS} sm:hidden`}>
      <QuickActionButton
        buttonRef={triggerRef}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        label="More"
        icon={<MoreIcon className="size-6" />}
      />

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="jp-fade-in fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelId}
            tabIndex={-1}
            className="jp-sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-card pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
          >
            <p
              id={labelId}
              className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              More actions
            </p>
            <ul className="p-2 pt-1">
              {actions.map((action) => (
                <li key={action.key}>
                  {action.href ? (
                    <Link
                      href={action.href}
                      onClick={close}
                      className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground"
                    >
                      <span className="text-primary">{action.icon}</span>
                      {action.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        maintenanceToastFor(action.label);
                      }}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground"
                    >
                      <span className="text-muted-foreground">{action.icon}</span>
                      {action.label}
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">Maintenance</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

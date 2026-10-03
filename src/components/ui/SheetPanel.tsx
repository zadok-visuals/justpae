"use client";

import { useEffect, useRef } from "react";

/**
 * One component, two shapes: a bottom sheet on mobile, a right-hand panel on
 * desktop. Never a centred modal.
 *
 * That is a deliberate structural choice rather than a stylistic one. A
 * centred modal on a phone puts its content in the middle of the screen,
 * furthest from the thumb, and its dismiss affordance in a corner. A sheet
 * rises from the edge the thumb is already near and is dismissed by swiping
 * the way it came. On a desktop the same content wants to sit beside the list
 * it came from, so the list stays readable as context.
 *
 * The two layouts are CSS only — one DOM tree, no viewport branching in JS, so
 * there is no hydration mismatch and no resize listener.
 */
export function SheetPanel({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Escape closes. Expected on desktop, and free on mobile.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    // The page behind must not scroll while this is open — on a phone,
    // scrolling the body under a sheet is the classic "the page moved while I
    // was reading" bug.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus moves into the panel so a keyboard or screen-reader user is
    // actually inside what just opened.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Returning focus matters most for a list: the row that was activated
      // should be where the cursor lands again.
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      {/* Scrim. A button, not a div with onClick, so it is reachable and
          announced rather than being an invisible trap for a keyboard user. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="jp-fade-in absolute inset-0 bg-ink/70 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={[
          "relative flex w-full flex-col bg-card",
          // Mobile: a sheet from the bottom, rounded at the top, never taller
          // than most of the screen so the page behind stays visible as
          // context for where it came from.
          "max-h-[88dvh] rounded-t-2xl border-t border-border jp-sheet-in",
          // Desktop: a full-height panel on the right.
          "sm:h-full sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-l sm:border-t-0 sm:jp-panel-in",
        ].join(" ")}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          {/* Grab handle: the visual cue that this came from the bottom edge
              and can go back there. Mobile only. */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted sm:hidden"
          />
          <h2 className="mt-2 text-base font-semibold text-foreground sm:mt-0">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            // size-11 is 44px. An ✕ glyph makes a small visual target look
            // adequate; the negative margins keep the box from pushing the
            // header taller than the title line it sits on.
            className="-my-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground"
          >
            ✕
          </button>
        </header>

        {/* scroll-contain keeps this list's own bounce without dragging the
            page behind it once it reaches the end. */}
        <div className="scroll-contain min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>

        {footer && (
          // The safe-area padding is why viewport-fit=cover is set in the root
          // layout: without that meta tag env() reads 0 and a footer button
          // sits under the home indicator.
          <footer className="border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

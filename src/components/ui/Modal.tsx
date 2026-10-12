"use client";

import { useEffect, useRef } from "react";

/**
 * The one modal primitive, built on the native <dialog> element.
 *
 * WHY NATIVE, and not a div with a high z-index: `showModal()` gives three
 * things for free that hand-rolled modals in this codebase would otherwise
 * each have to reimplement, and usually wouldn't —
 *
 *   1. A focus trap. The browser confines Tab to the dialog's subtree.
 *   2. Escape to dismiss, via the dialog's own `cancel` event.
 *   3. The top layer, so it renders above everything regardless of what
 *      stacking context it was opened from — including the sticky bottom tab
 *      bar, which is exactly what a hand-rolled overlay ends up behind.
 *
 * Outside-click is the one behaviour the element does NOT give us: a click on
 * the ::backdrop targets the <dialog> itself, so that is what the handler
 * below checks for. Clicks inside the content div stop at the content div and
 * never reach it.
 *
 * `closedby="any"` would cover it declaratively but is not in every browser
 * this app targets yet, so the handler stays.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  /** id of the element naming this dialog, for assistive tech. */
  labelledBy?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // Guarded both ways: calling showModal() on an already-open dialog throws,
    // and close() on a closed one is a no-op that still fires events.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      // preventDefault, then route through onClose: letting the browser close
      // the dialog directly would leave the parent's `open` state saying it is
      // still open, and the next open would be a no-op.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-card p-0 text-foreground backdrop:bg-black/60 open:animate-none"
    >
      {/* The inner div is what stops a content click reaching the backdrop
          check above. It is not decorative. */}
      <div className={`p-5 ${className}`}>{children}</div>
    </dialog>
  );
}

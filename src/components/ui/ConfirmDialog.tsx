"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * "Are you sure?" — with the actual figures on it.
 *
 * The product had no confirmation step of any kind: every withdrawal,
 * conversion, bill payment, PIN change and payout-recipient change committed
 * on a single tap. This is that step.
 *
 * The rule it follows: a confirmation that only says "are you sure?" is worse
 * than none at all, because it trains people to tap through it. So `rows` is
 * not optional decoration — it is the point. For a withdrawal it carries the
 * amount, the fee, what actually arrives and where it is going; for a
 * conversion both amounts, the rate and when the quote dies.
 */
export interface ConfirmRow {
  label: string;
  value: React.ReactNode;
  /** Renders in the accent colour — for the figure that matters most. */
  emphasis?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  body,
  rows,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  rows?: ConfirmRow[];
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  return (
    <Modal open={open} onClose={onCancel} labelledBy={titleId}>
      <h2 id={titleId} className="text-lg font-semibold text-foreground">
        {title}
      </h2>

      {body && <p className="mt-2 text-sm text-muted-foreground">{body}</p>}

      {rows && rows.length > 0 && (
        <dl className="mt-4 space-y-2 rounded-xl border border-border bg-secondary p-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
              <dd
                className={`min-w-0 break-words text-right font-medium ${
                  row.emphasis ? "text-primary" : "text-foreground"
                }`}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Cancel first in the DOM, so it is what the native focus trap lands on
          and what Enter does not fire. The confirm button is the deliberate
          one. */}
      <div className="mt-5 flex gap-3">
        <Button type="button" variant="secondary" size="md" fullWidth onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? "danger" : "primary"}
          size="md"
          fullWidth
          loading={pending}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * The plumbing every caller of ConfirmDialog otherwise writes by hand: hold a
 * pending intent, confirm it, run it.
 *
 * `intent` is generic so a caller can stash whatever it needs to show on the
 * dialog (an amount, a quote, a recipient) and read it back when building the
 * rows — rather than reaching for the live form state, which may have changed
 * between opening the dialog and confirming it.
 */
export function useConfirm<T>() {
  const [intent, setIntent] = useState<T | null>(null);

  return {
    intent,
    open: intent !== null,
    ask: (next: T) => setIntent(next),
    cancel: () => setIntent(null),
    /** Clears the intent and hands it to `run`. */
    confirm: (run: (intent: T) => void) => {
      if (intent === null) return;
      const current = intent;
      setIntent(null);
      run(current);
    },
  };
}

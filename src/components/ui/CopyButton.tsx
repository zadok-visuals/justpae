"use client";

import { useState } from "react";

/**
 * Copy-to-clipboard with its own confirmation.
 *
 * The confirmation is the whole point: without it the user taps, nothing
 * visibly happens, and they tap again — or worse, paste something stale
 * believing the copy worked.
 *
 * navigator.clipboard needs a secure context and can be refused outright.
 * When it fails the value stays visible and selectable so the text can still
 * be copied by hand, and the button says so rather than silently doing
 * nothing.
 */
export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      // h-11, not h-9: 44px is the floor for a touch target, and this one is
      // tapped more than almost anything else on a receipt.
      className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground ${className}`}
      // Announced to a screen reader, which gets no visual confirmation.
      aria-label={`${label} ${value}`}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select to copy" : label}
    </button>
  );
}

/**
 * A value with a copy button beside it — references, account numbers, wallet
 * addresses. Monospaced because these are read character by character, and
 * breakable because a wallet address is longer than a phone is wide.
 */
export function CopyField({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  /** For the electricity token, which is the point of the whole receipt. */
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary p-3">
      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`min-w-0 flex-1 break-all font-mono text-foreground ${
            emphasis ? "text-xl font-semibold tracking-wider" : "text-sm"
          }`}
        >
          {value}
        </span>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

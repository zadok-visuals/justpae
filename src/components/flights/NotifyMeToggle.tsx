"use client";

import { useState, useTransition } from "react";
import { setFeatureInterest } from "@/lib/actions/featureInterest";

/**
 * "Notify me when this opens", saved per user.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * OPTIMISTIC, AND HONEST ABOUT FAILING
 *
 * The switch moves the instant it is pressed, because a toggle that waits
 * for a round trip before moving feels broken on a slow connection — and
 * this screen is, by definition, shown to someone who is already being told
 * to come back later. If the write fails it moves BACK and says so, rather
 * than leaving a switch that looks on while nothing was saved. A silent
 * failure here means somebody waits for an email that will never come.
 *
 * It is a real <button role="switch">, not a styled checkbox: aria-checked
 * is the thing a screen reader announces, and the control has to be
 * operable with a keyboard.
 */
export function NotifyMeToggle({
  feature,
  initialInterested,
  label,
}: {
  feature: "flights" | "bills";
  initialInterested: boolean;
  label: string;
}) {
  const [interested, setInterested] = useState(initialInterested);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !interested;
    setInterested(next);
    setError(null);

    startTransition(async () => {
      const result = await setFeatureInterest(feature, next);
      if (result.error) {
        setInterested(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="block text-xs text-muted-foreground">
            {interested
              ? "We'll email you the moment it opens."
              : "No email unless you ask for one."}
          </span>
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={interested}
          aria-label={label}
          disabled={pending}
          onClick={toggle}
          // h-11 keeps the whole control at a 44px tap target even though the
          // track itself is 28px tall.
          className={`relative inline-flex h-11 w-14 shrink-0 items-center rounded-full px-1 transition-colors disabled:opacity-60 ${
            interested ? "bg-primary" : "bg-secondary border border-border"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-5 rounded-full bg-background transition-transform ${
              interested ? "translate-x-7" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

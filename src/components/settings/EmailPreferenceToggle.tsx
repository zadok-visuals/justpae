"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Primitives";
import { setEmailAnnouncementPreference } from "@/lib/actions/emailPreferences";

/**
 * GROUP 5. Scoped in its label, not just in code: "product updates" is the
 * admin broadcast composer's email, and nothing else reads this column —
 * account and security email (PIN locks, withdrawals, KYC decisions) always
 * sends, which is worth saying here so turning this off doesn't read as
 * turning those off too.
 */
export function EmailPreferenceToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic — a settings toggle that lags its own click reads as broken
    startTransition(async () => {
      const result = await setEmailAnnouncementPreference(next);
      if (result.error) {
        setEnabled(!next); // revert
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <label className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">Product update emails</span>
          <span className="block text-xs text-muted-foreground">
            News and announcements. Account and security emails always send.
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={isPending}
          onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-secondary"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 size-6 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </label>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Primitives";
import { setThemePreference } from "@/lib/actions/theme";
import type { ThemePreference } from "@/lib/theme";

/**
 * GROUP 9. Three options, not a single on/off switch, because "system"
 * genuinely is a third, different choice — not a midpoint between the other
 * two. Picking an option re-renders the page under the server-read cookie
 * (setThemePreference revalidates the whole layout), so the theme actually
 * changes rather than just this card's own label.
 */
const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeToggle({ initialPreference }: { initialPreference: ThemePreference }) {
  const [preference, setPreference] = useState(initialPreference);
  const [isPending, startTransition] = useTransition();

  function choose(next: ThemePreference) {
    if (next === preference) return;
    const previous = preference;
    setPreference(next); // optimistic, same reasoning as EmailPreferenceToggle
    startTransition(async () => {
      const result = await setThemePreference(next);
      if (result.error) {
        setPreference(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <h2 className="text-sm font-medium text-foreground">Theme</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        System follows your device&apos;s own light/dark setting.
      </p>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
      >
        {OPTIONS.map((option) => {
          const selected = option.value === preference;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isPending}
              onClick={() => choose(option.value)}
              className={`min-h-9 rounded-md text-sm font-medium transition-colors ${
                selected
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

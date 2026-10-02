"use client";

import { useId } from "react";
import { Label } from "@/components/ui/Field";

/**
 * The transaction PIN entry.
 *
 * One input rather than four or six boxes: separate boxes need focus
 * shuffling, paste splitting and backspace-to-previous handling, all of which
 * break autofill and screen readers, for a look. A single field with
 * `inputMode="numeric"` gets the right keypad and works everywhere.
 *
 * autoComplete="off" and the one-time-code exclusion are deliberate — a
 * browser must never remember or suggest a transaction PIN.
 */
export function PinField({
  name = "pin",
  label = "Transaction PIN",
  value,
  onValueChange,
  error,
  hint,
  autoFocus,
}: {
  name?: string;
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string | null;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();

  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <div className="jp-field flex h-12 items-center rounded-lg border border-input bg-secondary px-3">
        <input
          id={id}
          name={name}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          maxLength={6}
          placeholder="••••"
          value={value}
          // Digits only, enforced as the user types rather than rejected on
          // submit — the PIN is numeric and a letter is always a mistake.
          onChange={(e) => onValueChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1 border-0 bg-transparent py-0 font-mono text-lg tracking-[0.4em] text-foreground placeholder:tracking-normal placeholder:text-muted-foreground"
        />
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useId } from "react";
import { Label } from "@/components/ui/Field";

/**
 * A 6-digit email/SMS verification code. Unlike PinField (the transaction
 * PIN), this is not a secret the user chose — it's a one-time value sitting
 * in their inbox — so it's shown in plain text, not masked, and carries
 * autoComplete="one-time-code" so a platform that can see the code (Safari
 * reading SMS, a password manager that parsed the email) can offer to fill
 * it in.
 */
export function OtpField({
  name = "code",
  label = "Verification code",
  value,
  onValueChange,
  error,
  autoFocus,
}: {
  name?: string;
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const id = useId();

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="jp-field flex h-14 items-center rounded-lg border border-input bg-secondary px-3">
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          maxLength={6}
          placeholder="000000"
          value={value}
          onChange={(e) => onValueChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-invalid={error ? true : undefined}
          className="w-full min-w-0 border-0 bg-transparent py-0 text-center font-mono text-2xl tracking-[0.5em] text-foreground placeholder:tracking-[0.5em] placeholder:text-muted-foreground"
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

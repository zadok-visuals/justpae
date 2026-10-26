"use client";

import { useId } from "react";
import { Label, FIELD_SHELL, FIELD_PLACEHOLDER, fieldBorderClass } from "@/components/ui/Field";

/**
 * An email/SMS verification code. Unlike PinField (the transaction PIN),
 * this is not a secret the user chose — it's a one-time value sitting in
 * their inbox — so it's shown in plain text, not masked, and carries
 * autoComplete="one-time-code" so a platform that can see the code (Safari
 * reading SMS, a password manager that parsed the email) can offer to fill
 * it in.
 *
 * No native `maxLength`: Supabase's Email OTP Length is a dashboard setting,
 * not a constant, and a code longer than whatever this field used to assume
 * would arrive pre-truncated by the DOM on paste, before any JS ever saw it.
 * The 10-digit cap lives only in the slice below, well clear of anything
 * Supabase actually sends.
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
      <div className={`${FIELD_SHELL} ${fieldBorderClass(error)} h-14`}>
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          value={value}
          // Strips spaces and any non-digit the same way whether the digits
          // arrived typed or pasted — Gmail and others sometimes render a
          // code with a mid-string space, and a paste must not lose digits
          // to a maxLength that assumed a shorter code.
          onChange={(e) => onValueChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          aria-invalid={error ? true : undefined}
          className={`w-full min-w-0 border-0 bg-transparent py-0 text-center font-mono text-2xl tracking-[0.5em] text-foreground placeholder:tracking-[0.5em] ${FIELD_PLACEHOLDER}`}
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

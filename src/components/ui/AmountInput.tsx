"use client";

import { useId } from "react";
import { Label } from "@/components/ui/Field";
import { currencyMeta } from "@/lib/currencies";
import type { Currency } from "@/lib/types/database";

/**
 * The amount field.
 *
 * Three things it has to get right, all of which are the difference between
 * "usable on a phone" and "a form":
 *
 *  1. `inputMode="decimal"` brings up a numeric keypad with a decimal point.
 *     A plain text input gives a full QWERTY keyboard for typing digits.
 *  2. Thousands separators while typing. 1500000 and 1,500,000 are the same
 *     number and only one can be read at a glance, which matters most for
 *     naira amounts where six figures is routine.
 *  3. A Max button. Converting or withdrawing a whole balance is the most
 *     common single intent, and making the user read a balance and retype it
 *     invites off-by-one-digit mistakes.
 *
 * The value is held as a formatted string and reported back unformatted, so
 * the form posts a clean number while the user sees a readable one. The raw
 * value also goes into a hidden input: the visible field's own value carries
 * commas, which would reach the server as NaN.
 */

/** Strips separators and anything that isn't a digit or a single dot. */
export function parseAmount(formatted: string): number {
  const cleaned = formatted.replace(/,/g, "").replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  const normalised = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : 0;
}

/** Groups the integer part, leaving a trailing dot and decimals as typed. */
export function formatAmountInput(raw: string): string {
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (cleaned === "") return "";

  const firstDot = cleaned.indexOf(".");
  const integerPart = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot);
  // Everything after the first dot, with later dots dropped — "1.2.3" is a
  // typo, not an instruction.
  const decimalPart = firstDot === -1 ? null : cleaned.slice(firstDot + 1).replace(/\./g, "");

  const grouped = integerPart === "" ? "" : Number(integerPart).toLocaleString("en-US");

  if (decimalPart === null) return grouped;
  // Two decimal places maximum: every currency here is minor-unit-of-100, and
  // a third digit would be silently rounded by the server anyway.
  return `${grouped}.${decimalPart.slice(0, 2)}`;
}

export function AmountInput({
  name,
  label,
  currency,
  value,
  onValueChange,
  max,
  onMax,
  hint,
  error,
  autoFocus,
  readOnly,
  className = "",
}: {
  name: string;
  label: string;
  currency: Currency;
  /** Formatted display value, e.g. "1,500.00". */
  value: string;
  onValueChange: (formatted: string) => void;
  /** Available balance, enabling the Max button when provided. */
  max?: number;
  onMax?: () => void;
  hint?: string;
  error?: string | null;
  autoFocus?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  const id = useId();
  const meta = currencyMeta(currency);

  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>

      <div className="jp-field flex items-center gap-2 rounded-lg border border-input bg-secondary px-3 py-2.5">
        <span className="shrink-0 font-mono text-base text-muted-foreground">{meta.symbol}</span>

        <input
          id={id}
          inputMode="decimal"
          // Not type="number": it rejects the commas this field shows, and on
          // some browsers it adds spinner arrows nobody wants on money.
          type="text"
          autoComplete="off"
          autoFocus={autoFocus}
          readOnly={readOnly}
          value={value}
          onChange={(e) => onValueChange(formatAmountInput(e.target.value))}
          placeholder="0.00"
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1 border-0 bg-transparent font-display text-2xl tabular-nums text-foreground placeholder:text-muted-foreground"
        />

        {max != null && onMax && (
          <button
            type="button"
            onClick={onMax}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary"
          >
            Max
          </button>
        )}
      </div>

      {/* The parsed number is what the server reads. */}
      <input type="hidden" name={name} value={String(parseAmount(value))} />

      {error && (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

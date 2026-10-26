"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SheetPanel } from "@/components/ui/SheetPanel";
import { FIELD_SHELL, fieldBorderClass } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Primitives";
import { Amount } from "@/components/ui/Amount";
import { currencyMeta, isCurrency } from "@/lib/currencies";
import { sortCurrencyOptions, type CurrencyOptionData } from "@/lib/ui/currencyPicker";
import type { Currency } from "@/lib/types/database";

/**
 * GROUP 1a — THE currency list. Every one of them, in every flow.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY NOT A NATIVE <select>, WHICH IS WHAT THIS REPLACES
 *
 * Seven screens each built their own `<option>` string, and the platform
 * drew them three different ways. iOS renders a select's options in a wheel
 * that shows one line at a time; Android's dialog ignores every style the
 * app sets; a desktop browser shows the raw text. So "🇳🇬 NGN · NGN
 * 12,450.00 · Setup" — the longest of those strings — was fully readable on
 * one of the three, and a DISABLED option was grey on one platform and
 * barely marked on another. The state the user most needs to see was the one
 * least likely to survive.
 *
 * A sheet we draw ourselves renders identically everywhere, has room for the
 * flag, the code, the full currency name, the balance AND the state pill,
 * and can make a row do something other than select — which is what the
 * withdraw picker's "Add payout account" needs.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT GOES IN THE LIST IS NOT DECIDED HERE
 *
 * src/lib/ui/currencyPicker.ts builds the rows, reading availability from
 * the modules that own it. This file sorts (defensively — the builders
 * already did) and draws. It knows nothing about flags, rails or routes.
 */

/** The admin filters' "no currency chosen" value. */
export const ANY_CURRENCY = "all";

export function CurrencyPicker<V extends string = Currency>({
  label,
  value,
  options,
  onChange,
  name,
  hint,
  title,
  anyLabel,
  className = "",
}: {
  label: string;
  value: V;
  options: CurrencyOptionData[];
  onChange?: (next: V) => void;
  /**
   * Posts the chosen code in a plain HTML form. The admin ledger filter is a
   * GET form with no JavaScript in its submit path, so the value has to
   * reach the server as a field rather than as React state.
   */
  name?: string;
  hint?: string;
  /** The sheet's own heading. Defaults to the field label. */
  title?: string;
  /** Adds a leading "every currency" row, for a filter rather than a wallet. */
  anyLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // Uncontrolled when no onChange is given, which is the plain-form case:
  // the admin ledger filter is rendered by a Server Component and has no
  // state to lift the choice into — the hidden input below is the state.
  const [uncontrolled, setUncontrolled] = useState<V>(value);
  const current = onChange ? value : uncontrolled;

  const rows = sortCurrencyOptions(options);
  const selected = rows.find((row) => row.currency === current);
  const picked = isCurrency(current);

  function choose(next: V, href?: string) {
    setOpen(false);
    // A row carrying an href is an ERRAND, not a selection: picking a
    // currency with no payout destination should open the form that adds
    // one, which is the whole of Group 1d's last clause.
    if (href) router.push(href);
    else if (onChange) onChange(next);
    else setUncontrolled(next);
  }

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>

      {name && <input type="hidden" name={name} value={current} />}

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${picked ? current : (anyLabel ?? current)}. Choose a currency`}
        // Same shell as every other field — see .jp-field in globals.css.
        className={`${FIELD_SHELL} ${fieldBorderClass()} h-12 w-full text-left`}
      >
        {picked && <CurrencyGlyph currency={current} className="size-7 text-base" />}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {picked ? current : (anyLabel ?? current)}
          {picked && (
            <span className="ml-2 font-normal text-muted-foreground">
              {currencyMeta(current).label}
            </span>
          )}
        </span>
        {selected?.balance != null && (
          <span className="shrink-0 text-sm text-muted-foreground">
            <Amount currency={selected.currency} amount={selected.balance} />
          </span>
        )}
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">
          ▾
        </span>
      </button>

      <CurrencySheet
        open={open}
        onClose={() => setOpen(false)}
        title={title ?? label}
        value={current}
        options={rows}
        anyLabel={anyLabel}
        onChoose={(next, href) => choose(next as V, href)}
      />
    </div>
  );
}

/**
 * The list itself, without a trigger.
 *
 * Exported because Home's balance switcher is a chip on the blue card rather
 * than a form field — it cannot wear the grey field shell above, and it must
 * not be a second implementation of these rows either.
 */
export function CurrencySheet({
  open,
  onClose,
  title,
  value,
  options,
  anyLabel,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  value: string;
  options: CurrencyOptionData[];
  anyLabel?: string;
  onChoose: (next: string, href?: string) => void;
}) {
  const rows = sortCurrencyOptions(options);
  const picked = isCurrency(value);

  return (
    <SheetPanel open={open} onClose={onClose} title={title}>
      <ul className="space-y-1">
        {anyLabel && (
          <li>
            <button
              type="button"
              onClick={() => onChoose(ANY_CURRENCY)}
              aria-current={picked ? undefined : "true"}
              className={`flex min-h-14 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors ${
                picked ? "hover:bg-accent active:bg-accent" : "bg-secondary"
              }`}
            >
              {anyLabel}
            </button>
          </li>
        )}
        {rows.map((row) => (
          <li key={row.currency}>
            <CurrencyRow
              row={row}
              selected={row.currency === value}
              onChoose={() => onChoose(row.currency, row.href)}
            />
          </li>
        ))}
      </ul>
    </SheetPanel>
  );
}

/**
 * The round flag chip. A fixed circle rather than a bare emoji, so every row
 * starts at the same x whatever the glyph's width — and so USDT's coin sits
 * in the same shape as a country flag instead of floating.
 */
export function CurrencyGlyph({
  currency,
  className = "size-10 text-lg",
}: {
  currency: Currency;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-secondary leading-none ${className}`}
    >
      {currencyMeta(currency).flag}
    </span>
  );
}

function CurrencyRow({
  row,
  selected,
  onChoose,
}: {
  row: CurrencyOptionData;
  selected: boolean;
  onChoose: () => void;
}) {
  const meta = currencyMeta(row.currency);

  return (
    <button
      type="button"
      disabled={row.disabled}
      onClick={onChoose}
      aria-current={selected ? "true" : undefined}
      className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
        row.disabled
          ? "opacity-55"
          : selected
            ? "bg-secondary"
            : "hover:bg-accent active:bg-accent"
      }`}
    >
      <CurrencyGlyph currency={row.currency} />

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{row.currency}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta.label}</span>
      </span>

      {row.balance != null && (
        <span className="shrink-0 text-sm text-foreground">
          <Amount currency={row.currency} amount={row.balance} />
        </span>
      )}

      {/* Neutral grey for every state, whatever it is. An orange or red chip
          over a currency would read as something the user has done wrong. */}
      {row.pill && <Pill tone="neutral">{row.pill}</Pill>}

      {selected && !row.disabled && (
        <span aria-hidden="true" className="shrink-0 text-primary">
          ✓
        </span>
      )}
    </button>
  );
}

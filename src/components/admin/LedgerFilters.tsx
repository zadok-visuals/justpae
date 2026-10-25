import { LEDGER_KINDS, LEDGER_STATUSES, ledgerKindLabel } from "@/lib/admin/ledger";
import { CURRENCY_CODES } from "@/lib/currencies";
import { CurrencyPicker } from "@/components/ui/CurrencyPicker";
import { adminCurrencyOptions } from "@/lib/ui/currencyPicker";

/**
 * The filter bar over the admin ledger.
 *
 * A PLAIN GET FORM, with no JavaScript in it at all. Every filter ends up in
 * the URL, which is what makes a filtered view something an operator can
 * bookmark, reload, send to a colleague, and step back out of with the
 * browser's own Back button. A client-side filter with the state in React
 * gives up all four and buys nothing here — the page is server-rendered
 * either way, so a filter change is a navigation regardless.
 *
 * `page` is deliberately NOT carried across. Changing a filter while on page
 * 4 and landing on page 4 of a different, shorter result set is how an
 * operator concludes the filter returned nothing.
 */
export function LedgerFilters({
  search,
  kind,
  status,
  currency,
  from,
  to,
}: {
  search?: string;
  kind: string;
  status: string;
  currency: string;
  from?: string;
  to?: string;
}) {
  const hasAny =
    Boolean(search) || kind !== "all" || status !== "all" || currency !== "all" || from || to;

  return (
    <form
      method="get"
      action="/admin/transactions"
      className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <Field label="User" htmlFor="search" className="sm:col-span-2 lg:col-span-1">
        <input
          id="search"
          name="search"
          type="search"
          defaultValue={search ?? ""}
          placeholder="Name or email"
          className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        />
      </Field>

      <Field label="Type" htmlFor="kind">
        <Select id="kind" name="kind" value={kind} anyLabel="All types">
          {LEDGER_KINDS.map((k) => (
            <option key={k} value={k}>
              {ledgerKindLabel(k)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Status" htmlFor="status">
        <Select id="status" name="status" value={status} anyLabel="Any status">
          {LEDGER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>

      {/* GROUP 1a — the same picker the customer flows use, posting its code
          through a hidden input so this stays a plain GET form. Nothing is
          disabled here: an operator filters by a currency precisely when
          something about it has gone wrong. */}
      <div>
        <CurrencyPicker
          label="Currency"
          title="Filter by currency"
          name="currency"
          value={currency}
          anyLabel="Any currency"
          options={adminCurrencyOptions(CURRENCY_CODES)}
        />
      </div>

      <Field label="From" htmlFor="from">
        <input
          id="from"
          name="from"
          type="date"
          defaultValue={from ?? ""}
          className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        />
      </Field>

      <Field label="To" htmlFor="to">
        <input
          id="to"
          name="to"
          type="date"
          defaultValue={to ?? ""}
          className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        />
      </Field>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Apply
        </button>
        {hasAny && (
          <a
            href="/admin/transactions"
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground"
          >
            Clear
          </a>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * `defaultValue` rather than `value`, because this is an uncontrolled form
 * with no onChange — a `value` without one is React's "you made this field
 * read-only by accident" warning, and the field genuinely would be.
 */
function Select({
  id,
  name,
  value,
  anyLabel,
  children,
}: {
  id: string;
  name: string;
  value: string;
  anyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={value}
      className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
    >
      <option value="all">{anyLabel}</option>
      {children}
    </select>
  );
}

"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import type { ActivityFilter } from "@/lib/transactions";

/**
 * Filters, held in the URL query.
 *
 * The URL is the state. That is what makes a filtered view shareable, keeps it
 * intact through a refresh or a back button, and lets the server do the
 * filtering — component state would force the whole list into the client and
 * lose the view on every navigation.
 */

const TABS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "deposits", label: "Deposits" },
  { value: "withdrawals", label: "Withdrawals" },
  { value: "conversions", label: "Conversions" },
  { value: "bills", label: "Bills" },
  { value: "airtime", label: "Airtime" },
];

const STATUSES = [
  { value: "", label: "Any status" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

export function ActivityFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const filter = (params.get("filter") ?? "all") as ActivityFilter;
  const [search, setSearch] = useState(params.get("search") ?? "");

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      // Any filter change resets to the first page. Keeping page 3 while
      // narrowing the filter lands on an empty list that looks like "no
      // results" when there are plenty on page 1.
      next.delete("page");
      startTransition(() => router.push(`${pathname}?${next.toString()}`));
    },
    [params, pathname, router],
  );

  return (
    <div className="space-y-3">
      {/* The type tabs scroll horizontally rather than wrapping — six labels
          will not fit across 375px at a readable size, and wrapping them
          pushes the list itself below the fold. */}
      <div
        role="tablist"
        aria-label="Filter by type"
        className="snap-rail -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {TABS.map((tab) => {
          const active = filter === tab.value;
          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => update({ filter: tab.value === "all" ? null : tab.value })}
              className={`min-h-9 shrink-0 rounded-full border px-3 text-sm font-medium ${
                active
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <label className="sr-only" htmlFor="activity-search">
          Search by reference
        </label>
        <form
          className="sm:col-span-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ search: search.trim() || null });
          }}
        >
          <div className="jp-field flex h-11 items-center gap-2 rounded-lg border border-input bg-secondary px-3">
            <input
              id="activity-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by reference"
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              className="min-w-0 flex-1 border-0 bg-transparent py-0 text-foreground placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  update({ search: null });
                }}
                aria-label="Clear search"
                className="shrink-0 text-xs font-medium text-muted-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </form>

        <div className="jp-field flex h-11 items-center gap-2 rounded-lg border border-input bg-secondary px-3">
          <label className="sr-only" htmlFor="activity-status">
            Status
          </label>
          <select
            id="activity-status"
            value={params.get("status") ?? ""}
            onChange={(e) => update({ status: e.target.value || null })}
            className="min-w-0 flex-1 appearance-none border-0 bg-transparent py-0 text-foreground"
          >
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground">
            ▾
          </span>
        </div>

        <details className="rounded-lg border border-border bg-card px-3 py-2 sm:col-span-1">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Date range
          </summary>
          <div className="mt-2 space-y-2">
            <label className="block text-xs text-muted-foreground">
              From
              <input
                type="date"
                value={params.get("from") ?? ""}
                onChange={(e) => update({ from: e.target.value || null })}
                className="mt-1 h-10 w-full rounded-md border border-input bg-secondary px-2 text-foreground"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              To
              <input
                type="date"
                value={params.get("to") ?? ""}
                onChange={(e) => update({ to: e.target.value || null })}
                className="mt-1 h-10 w-full rounded-md border border-input bg-secondary px-2 text-foreground"
              />
            </label>
          </div>
        </details>
      </div>
    </div>
  );
}

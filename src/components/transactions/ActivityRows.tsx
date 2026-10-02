"use client";

import { useState } from "react";
import { StatusPill } from "@/components/ui/Primitives";
import { ActivityDetail } from "@/components/transactions/ActivityDetail";
import { formatSignedAmount } from "@/lib/currencies";
import type { UnifiedActivity } from "@/lib/transactions";
import {
  ReceiveIcon,
  WithdrawIcon,
  ConvertIcon,
  BillsIcon,
  AirtimeIcon,
} from "@/components/layout/NavIcons";

/**
 * Activity as date-grouped ROWS, not a table.
 *
 * A table needs horizontal room for its header and columns; on a 375px screen
 * it either scrolls sideways or crushes every column. Rows carry the same
 * information in a shape that reads top to bottom: type icon, title, signed
 * amount, status.
 *
 * Every row opens the detail view — on mobile a bottom sheet, on desktop a
 * right-hand panel.
 */

function iconFor(row: UnifiedActivity) {
  if (row.source === "deposit") return ReceiveIcon;
  if (row.source === "bill") return row.type === "airtime" ? AirtimeIcon : BillsIcon;
  return row.type === "withdrawal" ? WithdrawIcon : ConvertIcon;
}

/**
 * "Today" and "Yesterday" rather than a date, because that is how someone
 * looking for a transaction they just made thinks about it.
 */
function groupLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfRow = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfRow.getTime()) / 86_400_000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    // The year only appears once it is not the current one — printing it on
    // every row is noise for 11 months of the year.
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function groupByDate(rows: UnifiedActivity[]): { label: string; rows: UnifiedActivity[] }[] {
  const groups: { label: string; rows: UnifiedActivity[] }[] = [];
  for (const row of rows) {
    const label = groupLabel(row.created_at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

export function ActivityRows({
  rows,
  grouped = true,
}: {
  rows: UnifiedActivity[];
  /** Home's recent list is short enough that date headers add only noise. */
  grouped?: boolean;
}) {
  const [open, setOpen] = useState<UnifiedActivity | null>(null);
  const groups = grouped ? groupByDate(rows) : [{ label: "", rows }];

  return (
    <>
      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.label || "all"}>
            {group.label && (
              <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h3>
            )}
            <ul className="overflow-hidden rounded-xl border border-border bg-card">
              {group.rows.map((row) => {
                const Icon = iconFor(row);
                return (
                  <li key={`${row.source}-${row.id}`} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() => setOpen(row)}
                      className="flex w-full min-h-16 items-center gap-3 px-3 py-3 text-left hover:bg-accent"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-muted-foreground">
                        <Icon className="size-5" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {row.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {timeLabel(row.created_at)}
                        </span>
                      </span>

                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`text-sm font-semibold tabular-nums ${
                            row.direction === "in" ? "text-naira-light" : "text-foreground"
                          }`}
                        >
                          {formatSignedAmount(row.currency, row.amount, row.direction)}
                        </span>
                        <StatusPill status={row.status} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {open && (
        <ActivityDetail
          source={open.source}
          id={open.id}
          title={open.title}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { ActivityFilters } from "@/components/transactions/ActivityFilters";
import { ActivityRows } from "@/components/transactions/ActivityRows";
import { EmptyState } from "@/components/ui/Primitives";
import { fetchActivityPage, type ActivityFilter, type ActivityFilters as Filters } from "@/lib/transactions";
import type { TransactionStatus } from "@/lib/types/database";
import { isCurrency } from "@/lib/currencies";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const VALID_FILTERS: ActivityFilter[] = [
  "all",
  "deposits",
  "withdrawals",
  "conversions",
  "bills",
  "airtime",
];

const VALID_STATUSES = ["pending", "processing", "completed", "failed", "refunded"];

export default async function TransactionsPage(props: PageProps<"/transactions">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Next.js 16: searchParams is a Promise. Synchronous access was removed.
  const params = await props.searchParams;

  const filters = parseFilters(params);
  const page = parsePage(params.page);

  const { rows, hasMore } = await fetchActivityPage(supabase, user.id, filters, page, PAGE_SIZE);

  const hasAnyFilter =
    filters.filter !== "all" || !!filters.status || !!filters.from || !!filters.to || !!filters.search;

  return (
    <PageShell title="Activity" wide>
      <div className="space-y-4">
        <ActivityFilters />

        {rows.length === 0 ? (
          hasAnyFilter ? (
            <EmptyState
              title="Nothing matches those filters"
              body="Try a wider date range, a different status, or clear the search."
              action={{ href: "/transactions", label: "Clear filters" }}
            />
          ) : (
            <EmptyState
              title="No activity yet"
              body="Deposits, conversions, withdrawals and bill payments all land here."
              action={{ href: "/convert", label: "Convert some money" }}
            />
          )
        ) : (
          <>
            <ActivityRows rows={rows} />
            <Pager page={page} hasMore={hasMore} params={params} />
          </>
        )}
      </div>
    </PageShell>
  );
}

type RawParams = Awaited<PageProps<"/transactions">["searchParams"]>;

function first(value: string | string[] | undefined): string | undefined {
  // A repeated query param arrives as an array; taking the first is the only
  // sane reading of ?status=failed&status=completed.
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Every filter is validated against a whitelist before it reaches a query.
 * `status` and `filter` are interpolated into column comparisons and `search`
 * into an ilike pattern, so an unvalidated value is both a correctness and a
 * safety problem.
 */
function parseFilters(params: RawParams): Filters {
  const rawFilter = first(params.filter);
  const rawStatus = first(params.status);
  const rawCurrency = first(params.currency);

  return {
    filter: VALID_FILTERS.includes(rawFilter as ActivityFilter)
      ? (rawFilter as ActivityFilter)
      : "all",
    status: VALID_STATUSES.includes(rawStatus ?? "")
      ? (rawStatus as TransactionStatus | "refunded")
      : undefined,
    from: isIsoDate(first(params.from)) ? first(params.from) : undefined,
    to: isIsoDate(first(params.to)) ? first(params.to) : undefined,
    // The percent and underscore wildcards are stripped so a search for "%"
    // doesn't silently match every row.
    search: first(params.search)?.trim().replace(/[%_]/g, "") || undefined,
    currency:
      rawCurrency && isCurrency(rawCurrency) ? rawCurrency : undefined,
  };
}

function isIsoDate(value: string | undefined): boolean {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parsePage(value: string | string[] | undefined): number {
  const parsed = Number(first(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function Pager({
  page,
  hasMore,
  params,
}: {
  page: number;
  hasMore: boolean;
  params: RawParams;
}) {
  if (page === 0 && !hasMore) return null;

  function href(targetPage: number): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const single = first(value);
      if (single && key !== "page") next.set(key, single);
    }
    if (targetPage > 0) next.set("page", String(targetPage));
    const query = next.toString();
    return query ? `/transactions?${query}` : "/transactions";
  }

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-1">
      {page > 0 ? (
        <Link
          href={href(page - 1)}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground"
        >
          ← Newer
        </Link>
      ) : (
        <span />
      )}

      <span className="text-sm text-muted-foreground">Page {page + 1}</span>

      {hasMore ? (
        <Link
          href={href(page + 1)}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground"
        >
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

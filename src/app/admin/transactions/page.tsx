import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Banner, StatusPill } from "@/components/ui/Primitives";
import { CopyButton } from "@/components/ui/CopyButton";
import { Pager, parsePageParam, pageRange } from "@/components/ui/Pager";
import { LedgerFilters } from "@/components/admin/LedgerFilters";
import { ledgerKindLabel, isLedgerKind, isLedgerStatus } from "@/lib/admin/ledger";
import { formatAmount, isCurrency } from "@/lib/currencies";
import type { AdminActivityLedgerRow } from "@/lib/types/database";

const PAGE_SIZE = 25;

export const metadata = { title: "Transactions" };
export const dynamic = "force-dynamic";

/**
 * Every money movement in the product, with the user on the row.
 *
 * WHY THIS PAGE EXISTS. Until now an operator answering "what happened on
 * this account" had /admin/withdrawals, /admin/pay-to-china and nothing else
 * — two queues, each showing one kind of thing, neither showing deposits or
 * conversions at all. The question a support message actually asks is "a
 * customer quoted me this reference, what is it", and there was no screen
 * that could answer it.
 *
 * It reads migration 0027's `admin_activity_ledger`, which unions
 * transactions, deposits and bill_payments and joins the profile on. The
 * union has to be in the database rather than in this file: four separately
 * paged lists cannot be sorted into one page 2.
 *
 * PAGED WITH .range AND ONE EXTRA ROW, like every other list here — past
 * 1000 rows PostgREST silently truncates, and a silently truncated ledger is
 * an operator concluding a transaction does not exist.
 */
function parseParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export default async function AdminTransactionsPage({
  searchParams,
}: PageProps<"/admin/transactions">) {
  await requireAdminUser();
  const admin = createAdminClient();
  const params = await searchParams;

  const page = parsePageParam(params.page);
  const search = parseParam(params.search);
  const reference = parseParam(params.reference);

  // Every filter is validated against its own allow-list before it reaches a
  // query. Not because PostgREST would be injected — it would not — but
  // because an unrecognised value should produce "all" rather than a 400 the
  // operator reads as the page being broken.
  const rawKind = parseParam(params.kind) ?? "all";
  const kind = rawKind !== "all" && isLedgerKind(rawKind) ? rawKind : "all";
  const rawStatus = parseParam(params.status) ?? "all";
  const status = rawStatus !== "all" && isLedgerStatus(rawStatus) ? rawStatus : "all";
  const rawCurrency = (parseParam(params.currency) ?? "all").toUpperCase();
  const currency = rawCurrency !== "ALL" && isCurrency(rawCurrency) ? rawCurrency : "all";
  const from = parseParam(params.from);
  const to = parseParam(params.to);

  const { from: rangeFrom, to: rangeTo } = pageRange(page, PAGE_SIZE);

  let query = admin
    .from("admin_activity_ledger")
    .select("*")
    .order("created_at", { ascending: false })
    // created_at alone is not unique enough to page on: two rows written in
    // the same millisecond can swap places between pages, which both skips
    // and duplicates. id breaks the tie.
    .order("id", { ascending: false });

  // The reference lookup is a filter on the same list rather than a separate
  // box with its own result card. An operator pasting a reference wants the
  // row; showing it in the same shape as every other row means they can read
  // it without learning a second layout.
  if (reference) query = query.eq("reference", reference);
  if (kind !== "all") query = query.eq("kind", kind);
  if (status !== "all") query = query.eq("status", status);
  if (currency !== "all") query = query.eq("currency", currency);
  if (search) {
    // Name OR email, both case-insensitive. The comma syntax is PostgREST's
    // `or`; the value is wrapped in `*` for a contains match.
    const escaped = search.replace(/[,()*]/g, " ").trim();
    if (escaped) query = query.or(`user_email.ilike.*${escaped}*,user_name.ilike.*${escaped}*`);
  }
  if (from) query = query.gte("created_at", new Date(`${from}T00:00:00Z`).toISOString());
  if (to) {
    // Inclusive of the whole "to" day. A date input gives midnight, and an
    // operator filtering "to 5 March" means through the end of 5 March, not
    // up to the instant it began.
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    query = query.lt("created_at", end.toISOString());
  }

  const { data, error } = await query.range(rangeFrom, rangeTo);
  if (error) console.error("[admin/transactions] read failed", error);

  const all = (data ?? []) as AdminActivityLedgerRow[];
  const hasNext = all.length > PAGE_SIZE;
  const rows = all.slice(0, PAGE_SIZE);

  // Carried onto the Pager's links so paging does not silently drop the
  // filter the operator is looking through.
  const carried = {
    search,
    reference,
    kind: kind === "all" ? undefined : kind,
    status: status === "all" ? undefined : status,
    currency: currency === "all" ? undefined : currency,
    from,
    to,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deposits, conversions, withdrawals, Pay to China and bills, newest first, with the
          account each belongs to.
        </p>
      </div>

      <LedgerFilters
        search={search}
        kind={kind}
        status={status}
        currency={currency}
        from={from}
        to={to}
      />

      {reference && (
        <Banner tone="info" title="Filtered to one reference">
          Showing only rows whose provider reference is{" "}
          <span className="font-mono">{reference}</span>.{" "}
          <Link href="/admin/transactions" className="underline">
            Show everything
          </Link>
        </Banner>
      )}

      {error && (
        <Banner tone="warning" title="This list could not be read">
          The query behind this page failed. Check the server logs.
        </Banner>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="font-medium text-foreground">
            {page > 1 ? "Nothing further back than this" : "Nothing matches"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {page > 1
              ? "You've reached the end of this list."
              : "No movement matches these filters. Widen them, or clear them to see everything."}
          </p>
        </div>
      ) : (
        <>
          {/* Phone: a card per row. A seven-column table on a 360px screen is
              either unreadable or a horizontal scroll nobody discovers. */}
          <ul className="space-y-2 sm:hidden">
            {rows.map((row) => (
              <li key={`${row.source}-${row.id}`}>
                <Card className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <UserCell row={row} />
                    <StatusPill status={row.status} />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {ledgerKindLabel(row.kind)}
                    </span>
                    <AmountCell row={row} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <time dateTime={row.created_at}>
                      {new Date(row.created_at).toLocaleString("en-GB")}
                    </time>
                    {row.reference && (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-mono">{row.reference}</span>
                        <CopyButton value={row.reference} label="Copy" />
                      </span>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {/* Desktop: the table. */}
          <Card className="hidden sm:block">
            <div className="scroll-x">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="pb-2 font-medium">When</th>
                    <th scope="col" className="pb-2 font-medium">Account</th>
                    <th scope="col" className="pb-2 font-medium">Type</th>
                    <th scope="col" className="pb-2 text-right font-medium">Amount</th>
                    <th scope="col" className="pb-2 font-medium">Status</th>
                    <th scope="col" className="pb-2 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.source}-${row.id}`} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3 align-top text-muted-foreground">
                        <time dateTime={row.created_at}>
                          {new Date(row.created_at).toLocaleString("en-GB")}
                        </time>
                      </td>
                      <td className="max-w-56 py-2 pr-3 align-top">
                        <UserCell row={row} />
                      </td>
                      <td className="py-2 pr-3 align-top text-foreground">
                        {ledgerKindLabel(row.kind)}
                      </td>
                      <td className="py-2 pr-3 text-right align-top">
                        <AmountCell row={row} />
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <StatusPill status={row.status} />
                      </td>
                      <td className="max-w-40 py-2 align-top font-mono text-xs text-muted-foreground">
                        {row.reference ? (
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="truncate">{row.reference}</span>
                            <CopyButton value={row.reference} label="Copy" />
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Pager page={page} hasNext={hasNext} basePath="/admin/transactions" params={carried} />
    </div>
  );
}

/**
 * The account a row belongs to. The email links to the ledger filtered to
 * that account, which is the next thing an operator wants in almost every
 * case — there is no per-user admin page to link to instead.
 */
function UserCell({ row }: { row: AdminActivityLedgerRow }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate font-medium text-foreground">{row.user_name || "—"}</span>
      <Link
        href={`/admin/transactions?search=${encodeURIComponent(row.user_email)}`}
        className="truncate text-xs text-primary hover:underline"
      >
        {row.user_email}
      </Link>
    </div>
  );
}

function AmountCell({ row }: { row: AdminActivityLedgerRow }) {
  return (
    <div className="flex flex-col items-end">
      <span className="tabular-nums font-medium text-foreground">
        {formatAmount(row.currency, row.amount)}
      </span>
      {row.target_currency && row.target_amount != null && (
        <span className="tabular-nums text-xs text-muted-foreground">
          → {formatAmount(row.target_currency, row.target_amount)}
        </span>
      )}
      {row.fee != null && row.fee > 0 && (
        <span className="tabular-nums text-xs text-muted-foreground">
          fee {formatAmount(row.currency, row.fee)}
        </span>
      )}
    </div>
  );
}

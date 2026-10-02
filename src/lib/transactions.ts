import type { createClient } from "@/lib/supabase/server";
import type { BillCategory, Currency, TransactionStatus } from "@/lib/types/database";

/**
 * The ONE place several money tables are unified into a single activity feed.
 *
 * Three tables record user financial activity and each is written on its own:
 * `transactions` (conversions and withdrawals), `deposits` (money entering
 * from outside) and `bill_payments`. They are merged at READ time rather than
 * migrated into one table, which keeps each writer's shape honest.
 *
 * ⚠️  READ THIS BEFORE ADDING A MONEY TABLE. In the architecture this is built
 * on, two tables were added to the schema and then forgotten here — first
 * deposits, then conversions — and each silently vanished from both the recent
 * activity list and the full transactions page until a user complained. ANY
 * new table that debits or credits a wallet MUST be added as a source in this
 * file, in `countSources`, and in `isMostRecentForCurrency`. There is no test
 * that catches the omission; the rows just never appear.
 *
 * Pagination happens on the SERVER. The previous implementation fetched every
 * row from every table on every page view and sliced in memory, which is fine
 * for a demo account and ruinous for a real one.
 */

export type ActivitySource = "transaction" | "deposit" | "bill";

/** The filter tabs. "airtime" is a bill_payments category, not its own table. */
export type ActivityFilter =
  | "all"
  | "deposits"
  | "withdrawals"
  | "conversions"
  | "bills"
  | "airtime";

export interface UnifiedActivity {
  id: string;
  source: ActivitySource;
  /** "deposit" | "withdrawal" | "convert" | a BillCategory. */
  type: string;
  /** Signed direction, so a row renders without re-deriving it from `type`. */
  direction: "in" | "out";
  amount: number;
  currency: Currency;
  status: TransactionStatus | "refunded";
  reference: string | null;
  /** Set for conversions, so a row can show "NGN → USDT" without a second read. */
  targetCurrency: Currency | null;
  targetAmount: number | null;
  title: string;
  created_at: string;
}

export interface ActivityFilters {
  filter?: ActivityFilter;
  status?: TransactionStatus | "refunded";
  /** Inclusive ISO date (YYYY-MM-DD). */
  from?: string;
  /** Inclusive ISO date (YYYY-MM-DD) — widened to end-of-day below. */
  to?: string;
  /** Matched against each source's provider reference and against the row id. */
  search?: string;
  currency?: Currency;
}

export interface ActivityPage {
  rows: UnifiedActivity[];
  /** True when another page exists. Cheaper and more honest than a total. */
  hasMore: boolean;
  page: number;
  pageSize: number;
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Which tables a filter actually needs. Skipping a source skips its query. */
function sourcesFor(filter: ActivityFilter): ActivitySource[] {
  switch (filter) {
    case "deposits":
      return ["deposit"];
    case "withdrawals":
    case "conversions":
      return ["transaction"];
    case "bills":
    case "airtime":
      return ["bill"];
    default:
      return ["transaction", "deposit", "bill"];
  }
}

function endOfDay(date: string): string {
  // A date-only `to` filter must include everything that happened that day. A
  // bare "2026-01-31" compares as midnight and silently drops the whole day.
  return `${date}T23:59:59.999Z`;
}

/**
 * One page of unified activity.
 *
 * When the filter narrows to a single table the query is a true server-side
 * `range()` — the database does the paging. When several tables are in play,
 * each is asked for only the first `(page + 1) * pageSize` rows, which is the
 * smallest window that can possibly contain this page after the merge. That is
 * bounded work per request, unlike fetching everything.
 */
export async function fetchActivityPage(
  supabase: ServerClient,
  userId: string,
  filters: ActivityFilters = {},
  page = 0,
  pageSize = 20,
): Promise<ActivityPage> {
  const filter = filters.filter ?? "all";
  const sources = sourcesFor(filter);
  const single = sources.length === 1;

  // One extra row is the "is there another page" probe — no count query needed.
  const window = single ? pageSize + 1 : (page + 1) * pageSize + 1;
  const offset = single ? page * pageSize : 0;

  const [transactions, deposits, bills] = await Promise.all([
    sources.includes("transaction")
      ? queryTransactions(supabase, userId, filters, filter, offset, window)
      : Promise.resolve([] as UnifiedActivity[]),
    sources.includes("deposit")
      ? queryDeposits(supabase, userId, filters, offset, window)
      : Promise.resolve([] as UnifiedActivity[]),
    sources.includes("bill")
      ? queryBills(supabase, userId, filters, filter, offset, window)
      : Promise.resolve([] as UnifiedActivity[]),
  ]);

  const merged = [...transactions, ...deposits, ...bills].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (single) {
    return {
      rows: merged.slice(0, pageSize),
      hasMore: merged.length > pageSize,
      page,
      pageSize,
    };
  }

  const start = page * pageSize;
  return {
    rows: merged.slice(start, start + pageSize),
    hasMore: merged.length > start + pageSize,
    page,
    pageSize,
  };
}

/** Recent activity for Home. Always the newest few across every source. */
export async function fetchRecentActivity(
  supabase: ServerClient,
  userId: string,
  limit = 5,
): Promise<UnifiedActivity[]> {
  const { rows } = await fetchActivityPage(supabase, userId, {}, 0, limit);
  return rows;
}

async function queryTransactions(
  supabase: ServerClient,
  userId: string,
  filters: ActivityFilters,
  filter: ActivityFilter,
  offset: number,
  window: number,
): Promise<UnifiedActivity[]> {
  let query = supabase.from("transactions").select("*").eq("user_id", userId);

  if (filter === "withdrawals") query = query.eq("type", "withdrawal");
  if (filter === "conversions") query = query.eq("type", "convert");
  if (filters.status && filters.status !== "refunded") query = query.eq("status", filters.status);
  // `refunded` exists only on bill_payments, so this source contributes nothing.
  if (filters.status === "refunded") return [];
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", endOfDay(filters.to));
  if (filters.currency) {
    // A conversion has a source AND a target currency. Matching only the
    // source would hide a NGN→USDT conversion from the USDT view, where the
    // user is precisely looking for the credit it produced.
    query = query.or(`currency.eq.${filters.currency},target_currency.eq.${filters.currency}`);
  }
  if (filters.search) query = query.ilike("provider_reference", `%${filters.search}%`);

  const { data } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + window - 1);

  return (data ?? []).map((t) => {
    // When a currency filter matched only the target side, show the side the
    // user actually asked about — otherwise a USDT view displays the row's NGN
    // source amount, which reads as the wrong number entirely.
    const matchedTargetOnly =
      filters.currency != null &&
      t.currency !== filters.currency &&
      t.target_currency === filters.currency;

    const isWithdrawal = t.type === "withdrawal";

    return {
      id: t.id,
      source: "transaction" as const,
      type: t.type,
      direction: isWithdrawal ? ("out" as const) : matchedTargetOnly ? ("in" as const) : ("out" as const),
      amount: matchedTargetOnly ? (t.target_amount ?? t.amount) : t.amount,
      currency: matchedTargetOnly ? (t.target_currency as Currency) : t.currency,
      status: t.status,
      reference: t.provider_reference,
      targetCurrency: t.target_currency,
      targetAmount: t.target_amount,
      title: isWithdrawal
        ? `Withdrawal to ${t.currency}`
        : `${t.currency} to ${t.target_currency ?? "—"}`,
      created_at: t.created_at,
    };
  });
}

async function queryDeposits(
  supabase: ServerClient,
  userId: string,
  filters: ActivityFilters,
  offset: number,
  window: number,
): Promise<UnifiedActivity[]> {
  if (filters.status === "refunded") return [];

  let query = supabase.from("deposits").select("*").eq("user_id", userId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", endOfDay(filters.to));
  if (filters.currency) query = query.eq("currency", filters.currency);
  if (filters.search) query = query.ilike("provider_reference", `%${filters.search}%`);

  const { data } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + window - 1);

  return (data ?? []).map((d) => ({
    id: d.id,
    source: "deposit" as const,
    type: "deposit",
    direction: "in" as const,
    // Show what actually arrived once it is known. These genuinely differ: a
    // requested 10 and a sent 12 are both real, and the confirmed figure is
    // the one that hit the balance.
    amount: d.confirmed_amount ?? d.amount,
    currency: d.currency,
    // Failed and expired deposits appear here too, deliberately. A deposit
    // that silently vanishes from the list is indistinguishable, to the user,
    // from money that was lost.
    status: d.status,
    reference: d.provider_reference,
    targetCurrency: null,
    targetAmount: null,
    title: `${d.currency} deposit`,
    created_at: d.created_at,
  }));
}

const BILL_TITLES: Record<BillCategory, string> = {
  airtime: "Airtime",
  data: "Data bundle",
  electricity: "Electricity",
  water: "Water",
  cable_tv: "Cable TV",
};

async function queryBills(
  supabase: ServerClient,
  userId: string,
  filters: ActivityFilters,
  filter: ActivityFilter,
  offset: number,
  window: number,
): Promise<UnifiedActivity[]> {
  let query = supabase.from("bill_payments").select("*").eq("user_id", userId);

  // The Airtime tab is its own filter even though airtime is a bill category,
  // because topping up a phone is the single most frequent action here and
  // burying it inside "Bills" makes it harder to find than it should be.
  if (filter === "airtime") query = query.eq("category", "airtime");
  if (filter === "bills") query = query.neq("category", "airtime");
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", endOfDay(filters.to));
  if (filters.currency) query = query.eq("currency", filters.currency);
  if (filters.search) query = query.ilike("provider_reference", `%${filters.search}%`);

  const { data } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + window - 1);

  return (data ?? []).map((b) => ({
    id: b.id,
    source: "bill" as const,
    type: b.category,
    // A refund is money coming back, so it reads as an inbound row rather than
    // an outbound one that happens to be labelled "refunded".
    direction: b.status === "refunded" ? ("in" as const) : ("out" as const),
    amount: b.amount + (b.fee ?? 0),
    currency: b.currency,
    status: b.status,
    reference: b.provider_reference,
    targetCurrency: null,
    targetAmount: null,
    title: `${BILL_TITLES[b.category]} — ${b.biller_name}`,
    created_at: b.created_at,
  }));
}

/**
 * "Is this the most recent activity touching this currency?" — used by the
 * transaction detail view to choose between "New balance" (nothing has moved
 * this currency since) and "Current balance" (something later already did).
 * Showing a stale "new balance" as if it were current is worse than showing
 * neither.
 *
 * Uses exactly the same per-table currency matching as the feed above,
 * including the either-side match on conversions, so the two cannot disagree.
 */
export async function isMostRecentForCurrency(
  supabase: ServerClient,
  userId: string,
  currency: Currency,
  createdAt: string,
): Promise<boolean> {
  const [{ count: laterTransactions }, { count: laterDeposits }, { count: laterBills }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .or(`currency.eq.${currency},target_currency.eq.${currency}`)
        .gt("created_at", createdAt),
      supabase
        .from("deposits")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("currency", currency)
        .gt("created_at", createdAt),
      supabase
        .from("bill_payments")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("currency", currency)
        .gt("created_at", createdAt),
    ]);

  return (laterTransactions ?? 0) === 0 && (laterDeposits ?? 0) === 0 && (laterBills ?? 0) === 0;
}

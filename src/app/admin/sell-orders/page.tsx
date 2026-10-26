import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState, DetailRow, Pill } from "@/components/ui/Primitives";
import { CopyButton } from "@/components/ui/CopyButton";
import { formatAmount } from "@/lib/currencies";
import type { Currency, SellOrderStatus } from "@/lib/types/database";

export const metadata = { title: "Sell orders" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUS_TONE: Record<SellOrderStatus, "pending" | "success" | "failed" | "neutral"> = {
  awaiting_deposit: "pending",
  received: "pending",
  sold: "success",
  credited_usdt: "neutral",
  expired: "neutral",
  failed: "failed",
};

const STATUS_LABEL: Record<SellOrderStatus, string> = {
  awaiting_deposit: "Awaiting USDT",
  received: "Selling",
  sold: "Sold",
  credited_usdt: "Credited USDT",
  expired: "Expired",
  failed: "Failed",
};

type Filter = "all" | "awaiting" | "flagged" | "failed" | "credited_usdt";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "awaiting", label: "Awaiting" },
  { value: "flagged", label: "Flagged amount mismatch" },
  { value: "failed", label: "Failed" },
  { value: "credited_usdt", label: "Credited USDT" },
];

function parseFilter(value: string | string[] | undefined): Filter {
  const raw = Array.isArray(value) ? value[0] : value;
  return FILTERS.some((f) => f.value === raw) ? (raw as Filter) : "all";
}

/**
 * GROUP — sell orders (migration 0046). Every order this account has ever
 * opened, each linked to the USDT deposit that funded it and the conversion
 * that sold it — both just ids here, shown with a copy button, rather than
 * new detail routes neither /admin/deposits nor /admin/transactions has an
 * equivalent of today.
 */
export default async function AdminSellOrdersPage({
  searchParams,
}: PageProps<"/admin/sell-orders">) {
  await requireAdminUser();
  const admin = createAdminClient();
  const params = await searchParams;
  const filter = parseFilter(params.status);

  let query = admin
    .from("sell_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (filter === "awaiting") query = query.in("status", ["awaiting_deposit", "received"]);
  else if (filter === "flagged") query = query.eq("flagged", true);
  else if (filter === "failed") query = query.eq("status", "failed");
  else if (filter === "credited_usdt") query = query.eq("status", "credited_usdt");

  const { data: orders } = await query;
  const rows = orders ?? [];

  const userIds = [...new Set(rows.map((o) => o.user_id))];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, email").in("id", userIds)
    : { data: [] };
  const emailFor = (userId: string) => profiles?.find((p) => p.id === userId)?.email ?? userId;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-foreground">Sell orders</h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/admin/sell-orders" : `/admin/sell-orders?status=${f.value}`}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium ${
              filter === f.value
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nothing here" body="No sell orders match this filter." />
      ) : (
        <div className="space-y-3">
          {rows.map((order) => {
            const currency = order.target_currency as Currency;
            return (
              <Card key={order.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{emailFor(order.user_id)}</span>
                  <div className="flex items-center gap-2">
                    {order.flagged && <Pill tone="failed">Mismatch &gt;10%</Pill>}
                    <Pill tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Pill>
                  </div>
                </div>

                <DetailRow label="Expected USDT">
                  {formatAmount("USDT", order.expected_usdt_amount)}
                </DetailRow>
                {order.received_usdt_amount != null && (
                  <DetailRow label="Received USDT">
                    {formatAmount("USDT", order.received_usdt_amount)}
                  </DetailRow>
                )}
                <DetailRow label="Estimated">{formatAmount(currency, order.estimated_target_amount)}</DetailRow>
                {order.failure_reason && (
                  <DetailRow label="Note">{order.failure_reason}</DetailRow>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>{new Date(order.created_at).toLocaleString("en-GB")}</span>
                  {order.deposit_id && (
                    <span className="inline-flex items-center gap-1">
                      Deposit <CopyButton value={order.deposit_id} label="Copy deposit id" />
                    </span>
                  )}
                  {order.conversion_transaction_id && (
                    <span className="inline-flex items-center gap-1">
                      Conversion <CopyButton value={order.conversion_transaction_id} label="Copy transaction id" />
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

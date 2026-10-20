import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/paging";
import { Card, Banner, EmptyState } from "@/components/ui/Primitives";
import { formatNumber } from "@/lib/currencies";
import { computePnl, type PnlInputRow } from "@/lib/admin/pnlMath";
import type { SupplierRateRow } from "@/lib/admin/supplierRate";

export const metadata = { title: "Margin" };
export const dynamic = "force-dynamic";

/**
 * Margin, in USDT, across every route that earns one.
 *
 * WHY USDT AND NOT "PER CURRENCY". This page used to total the margin on
 * provider conversions alone, summed per destination currency, because that
 * was the only route there was. There are now four — provider conversions,
 * yuan conversions, Pay to China and withdrawal fees — and they earn in
 * naira, shillings, yuan and USDT. A page that reports four separate totals
 * cannot answer "did we make money this month", and a page that adds them
 * together without converting answers it wrongly. So everything is converted,
 * once, at the supplier rate that was in force when the order happened, and
 * the arithmetic lives in src/lib/admin/pnlMath.ts under unit test.
 *
 * WHAT IS COUNTED. Completed orders only. A two-leg conversion sitting at
 * `partially_completed` has delivered one leg and owes the other; its margin
 * is not realised and counting it would book revenue on an order that can
 * still be refunded.
 *
 * NOTHING IS SILENTLY ZERO. An order that cannot be valued — no rate on file
 * for its pair, no rate trail recorded — is counted as skipped and said out
 * loud, because a missing order and a zero-margin order look identical in a
 * total and mean completely different things.
 */

/** The columns the margin calculation needs, and no others. */
type MarginRow = {
  id: string;
  created_at: string;
  type: "convert" | "withdrawal" | "pay_to_china";
  provider: string;
  currency: string;
  amount: number;
  target_currency: string | null;
  target_amount: number | null;
  actual_target_amount: number | null;
  raw_target_amount: number | null;
};

export default async function AdminPnlPage() {
  await requireAdminUser();
  const admin = createAdminClient();

  const [ratesResult, ordersResult] = await Promise.all([
    admin
      .from("supplier_rates")
      .select("base_currency, quote_currency, buy_rate, effective_from")
      .order("effective_from", { ascending: false }),
    // PAGED, not .limit(100). This page used to sum a hundred rows and print
    // the result as the margin, so past a hundred completed orders the figure
    // on screen was simply wrong — silently, with nothing saying it was
    // partial. A wrong list inconveniences someone; a wrong total misinforms
    // the operator about their own business.
    fetchAllRows<MarginRow>((from, to) =>
      admin
        .from("transactions")
        .select(
          "id, created_at, type, provider, currency, amount, target_currency, target_amount, actual_target_amount, raw_target_amount",
        )
        .in("type", ["convert", "withdrawal", "pay_to_china"])
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
  ]);

  if (ratesResult.error) console.error("[admin/pnl] supplier rates read failed", ratesResult.error);
  if (ordersResult.error) console.error("[admin/pnl] orders read failed", ordersResult.error);

  const rates: SupplierRateRow[] = (ratesResult.data ?? []).map((row) => ({
    base_currency: row.base_currency,
    quote_currency: row.quote_currency,
    buy_rate: Number(row.buy_rate),
    effective_from: row.effective_from,
  }));

  const inputRows: PnlInputRow[] = ordersResult.rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    type: row.type,
    provider: row.provider,
    currency: row.currency,
    amount: Number(row.amount),
    targetCurrency: row.target_currency,
    targetAmount: row.target_amount == null ? null : Number(row.target_amount),
    actualTargetAmount: row.actual_target_amount == null ? null : Number(row.actual_target_amount),
    rawTargetAmount: row.raw_target_amount == null ? null : Number(row.raw_target_amount),
  }));

  const { orders, totals } = computePnl(inputRows, rates);

  // The table shows a recent window out of the rows already valued. The
  // TOTALS above it are the whole set, which is the entire point.
  const recent = orders.slice(0, 100);

  const routeCards = [
    { label: "Conversions", value: totals.conversionUsdt },
    { label: "Yuan conversions", value: totals.cnyConversionUsdt },
    { label: "Pay to China", value: totals.payToChinaUsdt },
    { label: "Withdrawal fees", value: totals.withdrawalFeesUsdt },
  ];

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-foreground">Margin</h1>

      <Banner tone="info" title="How this is calculated">
        Every figure here is in USDT. The four routes earn in different currencies, so each order
        is converted at the supplier rate that was in force when it happened — that is the only
        way the four can be added into one total that means anything. Completed orders only.
      </Banner>

      {ratesResult.error || ordersResult.error ? (
        <Banner tone="warning" title="Some of this could not be read">
          A query behind this page failed, so the figures below are incomplete. Check the server
          logs before relying on them.
        </Banner>
      ) : null}

      {/* Said out loud. The whole point of the paging fix is that a partial
          total is never again presented as a complete one. */}
      {ordersResult.truncated && (
        <Banner tone="warning" title="These totals are incomplete">
          There are more completed orders than this page will read in one go, so the figures below
          cover only the most recent {ordersResult.rows.length.toLocaleString("en-US")}. Treat them
          as a floor, not a total.
        </Banner>
      )}

      {orders.length === 0 && totals.cnyFundedPayments === 0 ? (
        <EmptyState
          title="No completed orders yet"
          body="Margin appears here once conversions, payments and withdrawals start settling."
          action={{ href: "/admin", label: "Back to admin" }}
        />
      ) : (
        <>
          <Card className="space-y-1">
            <p className="text-sm text-muted-foreground">Total margin</p>
            <p className="font-display text-3xl font-semibold tabular-nums text-naira-light">
              {formatNumber(totals.totalUsdt)} USDT
            </p>
            <p className="text-xs text-muted-foreground">
              {orders.length.toLocaleString("en-US")} orders valued
              {totals.skipped > 0 ? ` · ${totals.skipped} could not be` : ""}
            </p>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {routeCards.map((route) => (
              <Card key={route.label} className="space-y-1">
                <p className="text-sm text-muted-foreground">{route.label}</p>
                <p className="font-display text-xl font-semibold tabular-nums text-foreground">
                  {formatNumber(route.value)} USDT
                </p>
              </Card>
            ))}
          </div>

          {/* An estimate that is not labelled is a lie with a decimal point on
              it. These orders ARE counted — the alternative was dropping the
              operator's first months of trading out of every total — but the
              rate behind them is the earliest on file, not the real one. */}
          {totals.estimated > 0 && (
            <Banner tone="info" title={`${totals.estimated} order(s) used an estimated rate`}>
              These orders were placed before the first supplier rate was recorded for their pair,
              so the earliest rate on file was used instead. They are counted in the totals above
              and marked “estimated” in the table below. Recording earlier rates under Rates &amp;
              Markup replaces the estimate with the real figure.
            </Banner>
          )}

          {totals.skipped > 0 && (
            <Banner tone="warning" title={`${totals.skipped} order(s) could not be valued`}>
              These have no supplier rate on file for their pair at all, so there is nothing to
              even estimate from. They are left out of the totals rather than counted as zero —
              add the missing pair under Rates &amp; Markup and they will appear.
            </Banner>
          )}

          {/* Not a gap. Saying so, because an operator who notices these
              missing from the total will otherwise assume it is one. */}
          {totals.cnyFundedPayments > 0 && (
            <Banner
              tone="info"
              title={`${totals.cnyFundedPayments} payment(s) funded from a yuan balance`}
            >
              Their margin was already counted when that yuan was bought, so counting it again on
              the spend would report the same trade twice. Deliberately excluded, not missing.
            </Banner>
          )}

          {recent.length > 0 && (
            <>
              <h2 className="mb-3 text-base font-semibold text-foreground">
                Last {recent.length} orders
              </h2>

              {/* GROUP 1c. Phone: a card per order, same rule as the
                  transactions ledger — a five-column table has no honest
                  layout at 360px. */}
              <ul className="space-y-2 sm:hidden">
                {recent.map((order) => (
                  <li key={order.id}>
                    <Card className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium text-foreground">
                          {order.routeLabel}
                          {order.estimated && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              estimated
                            </span>
                          )}
                        </span>
                        <time
                          dateTime={order.createdAt}
                          className="shrink-0 whitespace-nowrap text-xs text-muted-foreground"
                        >
                          {new Date(order.createdAt).toLocaleDateString("en-GB")}
                        </time>
                      </div>
                      <div className="flex items-end justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                          {order.paidLabel} → {order.gotLabel}
                        </span>
                        {order.pnlUsdt == null ? (
                          <span
                            className="text-xs text-muted-foreground"
                            title={order.skippedReason ?? undefined}
                          >
                            not valued
                          </span>
                        ) : (
                          <span className="tabular-nums text-naira-light">
                            {formatNumber(order.pnlUsdt)}
                          </span>
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>

              <Card className="hidden sm:block">
                <div className="scroll-x">
                  <table className="w-full min-w-[44rem] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th scope="col" className="pb-2 font-medium">
                          When
                        </th>
                        <th scope="col" className="pb-2 font-medium">
                          Route
                        </th>
                        <th scope="col" className="pb-2 text-right font-medium">
                          Paid
                        </th>
                        <th scope="col" className="pb-2 text-right font-medium">
                          Got
                        </th>
                        <th scope="col" className="pb-2 text-right font-medium">
                          Margin (USDT)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((order) => (
                        <tr key={order.id} className="border-b border-border last:border-0">
                          <td className="py-2 whitespace-nowrap text-muted-foreground">
                            {new Date(order.createdAt).toLocaleDateString("en-GB")}
                          </td>
                          <td className="py-2 font-medium text-foreground">
                            {order.routeLabel}
                            {order.estimated && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                estimated
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums text-foreground">
                            {order.paidLabel}
                          </td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {order.gotLabel}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {order.pnlUsdt == null ? (
                              <span
                                className="text-muted-foreground"
                                title={order.skippedReason ?? undefined}
                              >
                                not valued
                              </span>
                            ) : (
                              <span className="text-naira-light">{formatNumber(order.pnlUsdt)}</span>
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
        </>
      )}
    </div>
  );
}

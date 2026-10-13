import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/paging";
import { Card, Banner, EmptyState } from "@/components/ui/Primitives";
import { formatAmount, formatNumber } from "@/lib/currencies";
import type { Currency } from "@/lib/types/database";

/** The columns the margin calculation needs, and no others. */
type MarginRow = {
  id: string;
  created_at: string;
  currency: Currency;
  amount: number;
  target_currency: Currency | null;
  target_amount: number | null;
  raw_target_amount: number | null;
  provider_rate: number | null;
  markup_rate: number | null;
  customer_rate: number | null;
};

export const metadata = { title: "Margin" };
export const dynamic = "force-dynamic";

/**
 * Margin per order.
 *
 * This is computable at all ONLY because create_conversion records
 * raw_target_amount (what the provider actually delivered, pre-markup)
 * alongside target_amount (what the customer was credited). The gap between
 * them IS the margin.
 *
 * Without those two columns the markup collected on a completed order is
 * unrecoverable after the fact: the provider's original response is gone, and
 * reconstructing it from a stored rate loses every rounding step along the
 * way.
 *
 * Margin is summed PER TARGET CURRENCY and never across currencies. A total
 * mixing naira, cedis and dollars is a meaningless number that looks
 * authoritative.
 */
export default async function AdminPnlPage() {
  await requireAdminUser();
  const admin = createAdminClient();

  // PAGED, not .limit(100). This page used to sum a hundred rows and print the
  // result as the margin, so past a hundred completed conversions the figure
  // on screen was simply wrong — silently, with nothing saying it was partial.
  // A wrong list inconveniences someone; a wrong total misinforms the operator
  // about the business.
  const { rows, truncated, error } = await fetchAllRows<MarginRow>((from, to) =>
    admin
      .from("transactions")
      .select(
        "id, created_at, currency, amount, target_currency, target_amount, raw_target_amount, provider_rate, markup_rate, customer_rate",
      )
      .eq("type", "convert")
      .eq("status", "completed")
      .not("raw_target_amount", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );

  if (error) console.error("[admin/pnl] read failed", error);

  // The table shows a recent window out of the rows already fetched. The
  // TOTALS above it are the whole set, which is the entire point.
  const recent = rows.slice(0, 100);

  const byCurrency = new Map<Currency, { margin: number; volume: number; count: number }>();
  for (const row of rows) {
    if (!row.target_currency || row.raw_target_amount == null || row.target_amount == null) {
      continue;
    }
    const existing = byCurrency.get(row.target_currency) ?? { margin: 0, volume: 0, count: 0 };
    existing.margin += row.raw_target_amount - row.target_amount;
    existing.volume += row.target_amount;
    existing.count += 1;
    byCurrency.set(row.target_currency, existing);
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-foreground">Margin</h1>

      <Banner tone="info" title="How this is calculated">
        Margin is what the provider delivered minus what the customer was credited, recorded on
        each order at the moment it was created. Totals are per destination currency — mixing
        currencies in one figure would be meaningless. Every completed conversion is counted,
        not a recent sample.
      </Banner>

      {/* Said out loud. The whole point of the paging fix is that a partial
          total is never again presented as a complete one. */}
      {truncated && (
        <Banner tone="warning" title="These totals are incomplete">
          There are more completed conversions than this page will read in one go, so the figures
          below cover only the most recent {rows.length.toLocaleString("en-US")}. Treat them as a
          floor, not a total.
        </Banner>
      )}

      {byCurrency.size === 0 ? (
        <EmptyState
          title="No completed conversions yet"
          body="Margin appears here once conversions start settling."
          action={{ href: "/admin", label: "Back to admin" }}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...byCurrency.entries()].map(([currency, totals]) => (
              <Card key={currency} className="space-y-1">
                <p className="text-sm text-muted-foreground">Margin in {currency}</p>
                <p className="font-display text-2xl font-semibold tabular-nums text-naira-light">
                  {formatAmount(currency, totals.margin)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totals.count} orders · {formatAmount(currency, totals.volume)} credited
                </p>
              </Card>
            ))}
          </div>

          <Card>
            <h2 className="mb-3 text-base font-semibold text-foreground">
              Last {recent.length} conversions
            </h2>
            <div className="scroll-x">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="pb-2 font-medium">
                      When
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Pair
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Sent
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Provider gave
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Customer got
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Margin
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Spread
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="py-2 text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString("en-GB")}
                      </td>
                      <td className="py-2 font-medium text-foreground">
                        {row.currency} → {row.target_currency}
                      </td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {formatNumber(row.amount)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {row.raw_target_amount != null ? formatNumber(row.raw_target_amount) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {row.target_amount != null ? formatNumber(row.target_amount) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-naira-light">
                        {row.raw_target_amount != null && row.target_amount != null
                          ? formatNumber(row.raw_target_amount - row.target_amount)
                          : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {row.markup_rate != null
                          ? `${formatNumber(Number(row.markup_rate) * 100, 2)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

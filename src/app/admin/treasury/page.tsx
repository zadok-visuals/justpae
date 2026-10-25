import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Banner, EmptyState } from "@/components/ui/Primitives";
import { formatNumber } from "@/lib/currencies";
import { getBalances as korapayBalances } from "@/lib/korapay/client";
import { getBalances as bushaBalances } from "@/lib/busha/client";
import { getSweepSettings } from "@/lib/settings";
import { treasuryRows, treasuryWarnings, type ProviderBalances } from "@/lib/treasury/position";
import { sweepPaused } from "@/lib/treasury/sweep";
import { KORAPAY_AUTO_SWEEP } from "@/lib/flags";
import { MovementForm, SweepSettingsForm, SweepNowButton } from "@/components/admin/TreasuryForms";
import type { TreasuryMovement } from "@/lib/types/database";

export const metadata = { title: "Treasury" };
export const dynamic = "force-dynamic";

/**
 * Where the company's own money is.
 *
 * THE POINT IS THE COMPARISON, not the balances. Two provider dashboards
 * already show balances; what neither can show is the balance set against
 * what customers are owed, and that difference is the only number on this
 * page an operator acts on.
 *
 * A BALANCE THAT CANNOT BE READ RENDERS AS "—", NEVER AS ZERO. A provider
 * outage that looks like an empty account is how an operator funds an
 * account that was never short.
 *
 * THIS IS THE ONE SCREEN THAT NAMES THE PROVIDERS. The customer copy rule
 * stands everywhere else; an operator deciding which of two balances to top
 * up cannot do it from the words "primary" and "secondary".
 */
export default async function AdminTreasuryPage() {
  await requireAdminUser();
  const admin = createAdminClient();

  const [korapay, busha, liabilityResult, movementResult, pendingWithdrawalResult, conversionResult, sweep] =
    await Promise.all([
      korapayBalances().catch((err) => {
        console.error("[admin/treasury] Korapay balances unavailable", err);
        return null;
      }),
      bushaBalances().catch((err) => {
        console.error("[admin/treasury] Busha balances unavailable", err);
        return null;
      }),
      admin.rpc("admin_wallet_liabilities"),
      admin
        .from("treasury_movements")
        .select("*")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("transactions")
        .select("provider, currency, amount")
        .eq("type", "withdrawal")
        .in("status", ["pending", "processing"]),
      admin
        .from("transactions")
        .select("amount")
        .eq("type", "convert")
        .eq("currency", "NGN")
        .in("status", ["pending", "processing"]),
      getSweepSettings(),
    ]);

  const balances: ProviderBalances = {
    korapay: Object.fromEntries(
      Object.entries(korapay ?? {})
        .map(([currency, entry]) => [currency, entry?.available_balance])
        .filter(([, value]) => typeof value === "number"),
    ) as Record<string, number>,
    busha: Object.fromEntries(
      (busha ?? [])
        .map((row) => [row.currency, Number(row.available?.amount)] as const)
        .filter(([, value]) => Number.isFinite(value)),
    ),
  };

  const liabilities = Object.fromEntries(
    (liabilityResult.data ?? []).map((row) => [row.currency, Number(row.total)]),
  );

  const rows = treasuryRows(balances, liabilities);

  // Grouped here rather than in SQL: the same rows answer two questions (what
  // is waiting on each provider, and what the queue is worth), and a second
  // round trip for the second one is a round trip for nothing.
  const waitingByProvider = new Map<string, number>();
  for (const tx of pendingWithdrawalResult.data ?? []) {
    const key = `${tx.provider}:${tx.currency}`;
    waitingByProvider.set(key, (waitingByProvider.get(key) ?? 0) + Number(tx.amount));
  }

  const warnings = treasuryWarnings({
    bushaNgn: balances.busha.NGN ?? null,
    pendingNgnConversions: (conversionResult.data ?? []).reduce(
      (sum, row) => sum + Number(row.amount),
      0,
    ),
    pendingWithdrawals: [...waitingByProvider].map(([key, total]) => {
      const [provider, currency] = key.split(":");
      return { provider: provider!, currency: currency!, total };
    }),
    balances,
  });

  const movements = (movementResult.data ?? []) as TreasuryMovement[];
  const paused = sweepPaused(sweep.pausedUntil);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-foreground">Treasury</h1>

      {korapay == null && (
        <Banner tone="warning" title="Korapay balances could not be read">
          The figures below are missing that side. Nothing here is zero because of it — an
          unreadable balance shows as a dash.
        </Banner>
      )}
      {busha == null && (
        <Banner tone="warning" title="Busha balances could not be read">
          The figures below are missing that side.
        </Banner>
      )}

      {warnings.map((warning) => (
        <Banner key={warning.text} tone="warning" title={`${warning.currency} may be short`}>
          {warning.text}
        </Banner>
      ))}

      <Card className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Position</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            What the providers hold, against what customers could ask for. A negative
            difference means the wallets add up to more than the money behind them.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Currency</th>
                <th className="py-2 pr-3 text-right font-medium">Korapay</th>
                <th className="py-2 pr-3 text-right font-medium">Busha</th>
                <th className="py-2 pr-3 text-right font-medium">Owed to customers</th>
                <th className="py-2 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.currency} className="border-t border-border">
                  <td className="py-2 pr-3 font-medium text-foreground">{row.currency}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                    {row.korapay == null ? "—" : formatNumber(row.korapay)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                    {row.busha == null ? "—" : formatNumber(row.busha)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                    {formatNumber(row.liabilities)}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums ${
                      row.difference != null && row.difference < 0
                        ? "font-semibold text-danger"
                        : "text-foreground"
                    }`}
                  >
                    {row.difference == null ? "—" : formatNumber(row.difference)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <SweepSettingsForm
          settings={sweep}
          flagEnabled={KORAPAY_AUTO_SWEEP}
          paused={paused}
        />
        <MovementForm />
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Movements</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Company transfers only. Nothing here touches a customer balance.
            </p>
          </div>
          <SweepNowButton disabled={!KORAPAY_AUTO_SWEEP || paused} />
        </div>

        {movements.length === 0 ? (
          <EmptyState
            title="No movements recorded yet"
            body="Transfers between the providers and the company account will show here once one is recorded or swept."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">From</th>
                  <th className="py-2 pr-3 font-medium">To</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-t border-border">
                    <td className="py-2 pr-3 text-muted-foreground">{movement.occurred_on}</td>
                    <td className="py-2 pr-3 text-foreground">{movement.from_account}</td>
                    <td className="py-2 pr-3 text-foreground">{movement.to_account}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                      {movement.currency} {formatNumber(Number(movement.amount))}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{movement.source}</td>
                    <td className="py-2 text-muted-foreground">{movement.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

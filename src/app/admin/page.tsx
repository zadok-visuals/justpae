import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Primitives";
import { formatAmount } from "@/lib/currencies";
import { startRouteTiming } from "@/lib/perf/timing";
import type { AdminDashboardStats } from "@/lib/types/database";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

/**
 * The admin landing page.
 *
 * TWO SECTIONS, IN THIS ORDER, because they answer two different questions and
 * only one of them is urgent. "What needs me right now" comes first and is the
 * only part with links; "how is the product doing" is below it and is
 * deliberately not actionable. A dashboard that mixes a queue depth with a
 * seven-day signup count teaches the reader to skim both.
 *
 * EVERY NUMBER IS COUNTED FROM THE DATABASE, by admin_dashboard_stats() in
 * migration 0019 — one round trip instead of fifteen separate head-count
 * requests. There is no seeded, illustrative or placeholder figure anywhere on
 * this page. A made-up number on an operations dashboard is worse than a
 * missing one, because somebody will make a decision on it.
 */

const ZERO: AdminDashboardStats = {
  users_total: 0,
  users_new_7d: 0,
  users_suspended: 0,
  kyc_pending: 0,
  kyc_approved: 0,
  withdrawals_queued: 0,
  withdrawals_flagged: 0,
  automation_failed: 0,
  manual_review: 0,
  deposits_pending: 0,
  transactions_7d: 0,
  transactions_completed_7d: 0,
  support_unread: 0,
  support_threads: 0,
  admins_active: 0,
};

export default async function AdminPage() {
  const endRouteTiming = startRouteTiming("/admin");
  await requireAdminUser();
  const admin = createAdminClient();

  const [{ data, error }, { data: failed }] = await Promise.all([
    admin.rpc("admin_dashboard_stats"),
    // A short, deliberate window rather than every failure ever. This is a
    // "what has just gone wrong" list, and paging it would turn it into an
    // archive nobody reads.
    admin
      .from("deposits")
      .select("id, user_id, amount, currency, decline_reason, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .range(0, 9),
  ]);

  endRouteTiming();

  if (error) console.error("[admin] dashboard stats failed", error);
  const failedDeposits = failed ?? [];
  // Zeroes rather than a crash, and the banner below says so — a dashboard
  // that renders zeroes while claiming they are real is the one failure mode
  // worse than not rendering.
  const stats = (data as AdminDashboardStats | null) ?? ZERO;
  const unavailable = !!error || !data;

  const queues = [
    { href: "/admin/kyc", label: "Waiting on verification", count: stats.kyc_pending },
    { href: "/admin/withdrawals", label: "Withdrawals in the queue", count: stats.withdrawals_queued },
    {
      href: "/admin/withdrawals?filter=flagged",
      label: "Need extra verification",
      count: stats.withdrawals_flagged,
    },
    {
      href: "/admin/withdrawals?filter=broken",
      label: "Automation failed",
      count: stats.automation_failed,
    },
    { href: "/admin/support", label: "Unread support messages", count: stats.support_unread },
  ];

  const health = [
    { label: "Accounts", value: stats.users_total },
    { label: "New this week", value: stats.users_new_7d },
    { label: "Verified", value: stats.kyc_approved },
    { label: "Suspended", value: stats.users_suspended },
    { label: "Transactions this week", value: stats.transactions_7d },
    { label: "Completed this week", value: stats.transactions_completed_7d },
    { label: "Deposits pending", value: stats.deposits_pending },
    { label: "Flagged for review", value: stats.manual_review },
    { label: "Support threads", value: stats.support_threads },
    { label: "Active admins", value: stats.admins_active },
  ];

  return (
    <div className="space-y-7">
      {unavailable && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-semibold text-foreground">These numbers didn&apos;t load</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything below is showing zero because the query failed, not because there is nothing
            there. Reload, and check the logs if it persists.
          </p>
        </div>
      )}

      <section>
        <h1 className="mb-3 font-display text-2xl font-semibold text-foreground">What needs you</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          {queues.map((tile) => (
            <Link key={tile.href} href={tile.href}>
              <Card className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">{tile.label}</span>
                <span
                  className={`font-display text-2xl font-semibold tabular-nums ${
                    tile.count > 0 ? "text-primary" : "text-foreground"
                  }`}
                >
                  {tile.count}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* WHY THIS SECTION EXISTS: fail_deposit has always stored
          decline_reason, and the customer's own transaction detail has always
          shown it — but no admin screen did, so when a customer wrote in asking
          why their deposit bounced, the operator had less information than the
          customer. */}
      {failedDeposits.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Deposits that didn&apos;t go through
          </h2>
          <ul className="space-y-2">
            {failedDeposits.map((deposit) => (
              <li key={deposit.id}>
                <Card className="space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {formatAmount(deposit.currency, Number(deposit.amount))}
                    </span>
                    <time
                      dateTime={deposit.created_at}
                      className="font-mono text-[0.6875rem] text-muted-foreground"
                    >
                      {new Date(deposit.created_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p className="break-words text-sm text-muted-foreground">
                    {deposit.decline_reason?.trim() || "No reason was recorded."}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{deposit.user_id}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          The last seven days
        </h2>
        {/* Not links. These are for reading, and making them clickable would
            invite the reader to treat them as a queue.

            GROUP 1c. One column below sm, and the label and number share a
            row instead of stacking — two grid-cols-2 cards side by side at
            360px left no room for either the number or the label to read
            cleanly. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {health.map((tile) => (
            <Card key={tile.label} className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">{tile.label}</span>
              <span className="font-display text-xl font-semibold tabular-nums text-foreground">
                {tile.value.toLocaleString("en-GB")}
              </span>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Primitives";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

/**
 * The admin landing page: counts of the things waiting on a human.
 *
 * Deliberately only counts of work-in-progress, not aggregate volume. The
 * question this page answers is "what needs me right now", and a total-volume
 * dashboard buries that.
 */
export default async function AdminPage() {
  await requireAdminUser();
  const admin = createAdminClient();

  const [pendingKyc, pendingWithdrawals, flaggedWithdrawals, brokenAutomation] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }).eq("kyc_status", "pending"),
    admin
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("type", "withdrawal")
      .in("status", ["pending", "processing"]),
    admin
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("type", "withdrawal")
      .eq("requires_extra_verification", true)
      .is("extra_verification_confirmed_at", null),
    // Withdrawals whose automation broke BEFORE a provider transfer existed.
    // These are invisible to the reconcile cron and look identical in the
    // queue to a legitimately-manual above-threshold withdrawal, which is
    // exactly why they get their own count.
    admin
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("type", "withdrawal")
      .eq("status", "pending")
      .not("automated_payout_attempt_failed_reason", "is", null),
  ]);

  const tiles = [
    { href: "/admin/kyc", label: "Waiting on verification", count: pendingKyc.count ?? 0 },
    {
      href: "/admin/withdrawals",
      label: "Withdrawals in the queue",
      count: pendingWithdrawals.count ?? 0,
    },
    {
      href: "/admin/withdrawals?filter=flagged",
      label: "Need extra verification",
      count: flaggedWithdrawals.count ?? 0,
    },
    {
      href: "/admin/withdrawals?filter=broken",
      label: "Automation failed",
      count: brokenAutomation.count ?? 0,
    },
  ];

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-foreground">What needs you</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href}>
            <Card className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">{tile.label}</span>
              <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
                {tile.count}
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

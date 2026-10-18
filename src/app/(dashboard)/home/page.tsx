import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { WalletCards } from "@/components/home/WalletCards";
import { QuickActions } from "@/components/home/QuickActions";
import { BuySellRates } from "@/components/rates/BuySellRates";
import { ActivityRows } from "@/components/transactions/ActivityRows";
import { SectionHeader, EmptyState } from "@/components/ui/Primitives";
import { LiveRefresh } from "@/components/ui/LiveRefresh";
import { KycStatusBanner } from "@/components/kyc/KycStatusBanner";
import { fetchRecentActivity } from "@/lib/transactions";
import { resolveRateBoard } from "@/lib/rates/display";
import type { Wallet } from "@/lib/types/database";

export const metadata = { title: "Home" };

/**
 * Home.
 *
 * Accounts and Home are MERGED — there is no separate accounts page. A second
 * screen listing the same wallets with the same balances is a navigation item
 * that answers a question this page has already answered.
 *
 * Nothing is cached: a balance and a live rate are exactly the two things a
 * stale render must never show.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: wallets }, recent, rates] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, kyc_status, kyc_rejection_reason, kyc_type, country")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("wallets").select("*").eq("user_id", user.id),
    fetchRecentActivity(supabase, user.id, 5),
    // One resolver behind Home, /convert and the account pages — see
    // src/lib/rates/display.ts. A pair that fails degrades to "Unavailable"
    // for that currency alone rather than failing this render.
    resolveRateBoard(),
  ]);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;

  return (
    <PageShell title={firstName ? `Hello, ${firstName}` : "Home"}>
      <div className="space-y-6">
        <KycStatusBanner
          status={profile?.kyc_status}
          phone={profile?.phone}
          kycType={profile?.kyc_type}
          rejectionReason={profile?.kyc_rejection_reason}
        />

        <section>
          <SectionHeader title="Your wallets" action={{ href: "/accounts", label: "All accounts" }} />
          <WalletCards wallets={(wallets ?? []) as Wallet[]} />
        </section>

        <section>
          <SectionHeader title="Quick actions" />
          <QuickActions wallets={(wallets ?? []) as Wallet[]} />
        </section>

        <section>
          <SectionHeader title="Today's rates" />
          <BuySellRates rates={rates} variant="strip" />
          {/* The strip used to be rendered once and left there. Leave this
              screen open for an hour and the rate was an hour old, looking
              exactly as authoritative as a live one. */}
          <div className="mt-1.5">
            <LiveRefresh showTimestamp label="Rates updated" />
          </div>
        </section>

        <section>
          <SectionHeader title="Recent activity" action={{ href: "/transactions", label: "See all" }} />
          {recent.length === 0 ? (
            <EmptyState
              title="Nothing here yet"
              body="Your deposits, conversions, withdrawals and bill payments will show up here."
              action={{ href: "/convert", label: "Make your first conversion" }}
            />
          ) : (
            <ActivityRows rows={recent} grouped={false} />
          )}
        </section>
      </div>
    </PageShell>
  );
}

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
import { startRouteTiming } from "@/lib/perf/timing";
import type { Wallet } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

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
  const endRouteTiming = startRouteTiming("/home");
  const supabase = await createClient();
  const user = await requireSessionUser();

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

  endRouteTiming();

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;

  return (
    /**
     * GROUP 6a — two columns from 1024px up.
     *
     * The split is by what the content IS FOR, not by what fits. The left
     * column is what the user came to act on: are they verified, what have
     * they got, what can they do with it — read top to bottom, in that order,
     * which is the order of the questions. The right column is reference:
     * today's prices and what has happened lately. Neither needs the other to
     * make sense, which is what makes them separable at all.
     *
     * The alternative split — wallets and rates on the left, actions and
     * activity on the right — reads worse for a reason worth writing down:
     * "what have I got" and "what can I do with it" are one thought, and the
     * quick-action row is useless without the balances directly above it.
     *
     * Below 1024px this is exactly the single column it was, in the same
     * order, because PageShell stacks the aside after the children.
     */
    <PageShell
      title={firstName ? `Hello, ${firstName}` : "Home"}
      aside={
        <>
          <section>
            <SectionHeader title="Today's rates" />
            {/* The rate board gets its "stacked" variant in this column and
                keeps the horizontal "strip" on a phone. A 22rem column has
                room for the full two-line form, and a swipe rail inside a
                column nobody is swiping is a worse control than a list. */}
            <div className="lg:hidden">
              <BuySellRates rates={rates} variant="strip" />
            </div>
            <div className="hidden lg:block">
              <BuySellRates rates={rates} />
            </div>
            {/* The strip used to be rendered once and left there. Leave this
                screen open for an hour and the rate was an hour old, looking
                exactly as authoritative as a live one. */}
            <div className="mt-1.5">
              <LiveRefresh showTimestamp label="Rates updated" />
            </div>
          </section>

          <section>
            <SectionHeader
              title="Recent activity"
              action={{ href: "/transactions", label: "See all" }}
            />
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
        </>
      }
    >
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
      </div>
    </PageShell>
  );
}

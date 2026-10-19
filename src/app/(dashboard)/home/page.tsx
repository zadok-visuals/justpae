import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { WalletCards } from "@/components/home/WalletCards";
import { QuickActions } from "@/components/home/QuickActions";
import { RateBoardSection } from "@/components/rates/RateBoardSection";
import { RecentActivitySection } from "@/components/transactions/RecentActivitySection";
import { SectionHeader } from "@/components/ui/Primitives";
import { KycStatusBanner } from "@/components/kyc/KycStatusBanner";
import { startRouteTiming } from "@/lib/perf/timing";
import type { Wallet } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Home" };

/**
 * Home.
 *
 * Nothing is cached: a balance is exactly the thing a stale render must never
 * show.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GROUP 9b — WHAT THIS PAGE AWAITS, AND WHAT IT NO LONGER AWAITS
 *
 * It used to open the same way most Next pages do:
 *
 *   await Promise.all([profile, wallets, recentActivity, resolveRateBoard()])
 *
 * Parallel, which is right, and still wrong — because Promise.all finishes
 * when its SLOWEST member does. resolveRateBoard is six provider round trips
 * across the public internet; the wallets read is one Postgres query in the
 * same city as the function. So the user's balance, which was ready in single
 * digits of milliseconds, sat waiting on a rate board that nothing on the
 * screen depends on, on every single render.
 *
 * Now the page awaits only what it cannot draw without: the session, the
 * profile (for the KYC banner and the greeting) and the wallets. The rate
 * board and the activity list own their own reads inside Suspense boundaries
 * and arrive in later chunks, into skeletons already holding their space.
 *
 * The two remaining awaits stay in one Promise.all rather than becoming two
 * more boundaries. Both are single indexed Postgres reads next door to the
 * function, and the KYC banner and the greeting are the frame of the page
 * rather than content inside it — streaming the title of a page is motion for
 * its own sake.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const endRouteTiming = startRouteTiming("/home");
  const supabase = await createClient();
  const user = await requireSessionUser();

  const [{ data: profile }, { data: wallets }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, kyc_status, kyc_rejection_reason, kyc_type, country")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("wallets").select("*").eq("user_id", user.id),
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
          {/* The rate board gets its "stacked" variant in this column and
              keeps the horizontal "strip" on a phone. A 22rem column has room
              for the full two-line form, and a swipe rail inside a column
              nobody is swiping is a worse control than a list.

              Two boundaries rather than one shared one, so a slow provider
              cannot hold up the activity list and a slow activity query
              cannot hold up the prices. */}
          <div className="lg:hidden">
            <RateBoardSection variant="strip" />
          </div>
          <div className="hidden lg:block">
            <RateBoardSection />
          </div>

          <RecentActivitySection userId={user.id} seeAllHref="/transactions" />
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

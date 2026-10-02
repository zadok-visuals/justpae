import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { WalletCards } from "@/components/home/WalletCards";
import { QuickActions } from "@/components/home/QuickActions";
import { RatesStrip, type StripRate } from "@/components/home/RatesStrip";
import { ActivityRows } from "@/components/transactions/ActivityRows";
import { SectionHeader, EmptyState, Banner } from "@/components/ui/Primitives";
import { fetchRecentActivity } from "@/lib/transactions";
import { resolveRoute } from "@/lib/rates/routes";
import type { Currency, Wallet } from "@/lib/types/database";

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

/** The pairs worth a strip slot: local currency in and out of dollars/USDT. */
const STRIP_PAIRS: [Currency, Currency][] = [
  ["USD", "NGN"],
  ["USDT", "NGN"],
  ["USD", "GHS"],
  ["USD", "KES"],
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: wallets }, recent, rates] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, kyc_status, kyc_rejection_reason, country")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("wallets").select("*").eq("user_id", user.id),
    fetchRecentActivity(supabase, user.id, 5),
    loadStripRates(),
  ]);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;

  return (
    <PageShell title={firstName ? `Hello, ${firstName}` : "Home"}>
      <div className="space-y-6">
        {profile?.kyc_status !== "approved" && <KycBanner status={profile?.kyc_status} reason={profile?.kyc_rejection_reason} />}

        <section>
          <SectionHeader title="Your wallets" />
          <WalletCards wallets={(wallets ?? []) as Wallet[]} />
        </section>

        <section>
          <SectionHeader title="Quick actions" />
          <QuickActions />
        </section>

        <section>
          <SectionHeader title="Today's rates" />
          <RatesStrip rates={rates} />
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

function KycBanner({
  status,
  reason,
}: {
  status: string | undefined;
  reason: string | null | undefined;
}) {
  if (status === "pending") {
    return (
      <Banner tone="info" title="We're reviewing your details">
        You can deposit and convert while we check your documents. Withdrawals open up once
        you&apos;re verified.
      </Banner>
    );
  }

  if (status === "rejected") {
    return (
      <Banner
        tone="danger"
        title="We couldn't verify your details"
        action={{ href: "/onboarding/kyc", label: "Try again" }}
      >
        {/* The specific reason, not a generic "please resubmit" — without it
            the next attempt is a guess and gets rejected for the same thing. */}
        {reason ?? "Please review your documents and submit them again."}
      </Banner>
    );
  }

  return (
    <Banner
      tone="warning"
      title="Verify your identity to withdraw"
      action={{ href: "/onboarding/kyc", label: "Start verification" }}
    >
      It takes a couple of minutes. You can deposit and convert in the meantime.
    </Banner>
  );
}

/**
 * Resolves the strip's customer rates.
 *
 * Every pair is resolved independently and a failure degrades to "Unavailable"
 * for that pair alone — one unquotable pair must not blank the whole strip, and
 * a provider outage must not fail the Home render.
 */
async function loadStripRates(): Promise<StripRate[]> {
  return Promise.all(
    STRIP_PAIRS.map(async ([base, quote]) => {
      try {
        const route = await resolveRoute(base, quote);
        return {
          base,
          quote,
          customerRate: route.available ? route.customerRate : null,
        };
      } catch (err) {
        console.error("[home.loadStripRates] pair failed", { base, quote, err });
        return { base, quote, customerRate: null };
      }
    }),
  );
}

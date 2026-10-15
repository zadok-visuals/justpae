import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/layout/PageShell";
import { WalletCards } from "@/components/home/WalletCards";
import { QuickActions } from "@/components/home/QuickActions";
import { RatesStrip, type StripRate } from "@/components/home/RatesStrip";
import { ActivityRows } from "@/components/transactions/ActivityRows";
import { SectionHeader, EmptyState } from "@/components/ui/Primitives";
import { LiveRefresh } from "@/components/ui/LiveRefresh";
import { KycStatusBanner } from "@/components/kyc/KycStatusBanner";
import { fetchRecentActivity } from "@/lib/transactions";
import { resolveRoute } from "@/lib/rates/routes";
import { localCurrencyForCountry } from "@/lib/currencies";
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

  const [{ data: profile }, walletsResult, recent, rates] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, kyc_status, kyc_rejection_reason, kyc_type, country")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("wallets").select("*").eq("user_id", user.id),
    fetchRecentActivity(supabase, user.id, 5),
    loadStripRates(),
  ]);

  let wallets = walletsResult.data;

  // Auto-provision wallets if missing (trigger didn't fire at signup).
  if (!wallets || wallets.length === 0) {
    const admin = createAdminClient();
    const localCurrency = localCurrencyForCountry(profile?.country);
    const walletsToCreate: { user_id: string; currency: Currency }[] = [
      { user_id: user.id, currency: "USD" },
      { user_id: user.id, currency: "USDT" },
    ];
    if (localCurrency) {
      walletsToCreate.push({ user_id: user.id, currency: localCurrency });
    }
    await admin.from("wallets").upsert(walletsToCreate, { onConflict: "user_id,currency" });
    const { data: refreshed } = await supabase.from("wallets").select("*").eq("user_id", user.id);
    wallets = refreshed;
  }

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

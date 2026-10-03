// TEMPORARY — design verification harness. Deleted before commit.
import { WalletCards } from "@/components/home/WalletCards";
import { QuickActions } from "@/components/home/QuickActions";
import { RatesStrip } from "@/components/home/RatesStrip";
import { ActivityRows } from "@/components/transactions/ActivityRows";
import { SectionHeader, Banner, Card, EmptyState, SkeletonRows, DetailRow, StatusPill } from "@/components/ui/Primitives";
import { CopyField } from "@/components/ui/CopyButton";
import { BottomTabBar, Sidebar, MobileTopBar } from "@/components/layout/DashboardChrome";
import type { UnifiedActivity } from "@/lib/transactions";
import type { Wallet } from "@/lib/types/database";

const wallets: Wallet[] = [
  { user_id: "u", currency: "USD", balance: 1240.5, updated_at: new Date().toISOString() },
  { user_id: "u", currency: "NGN", balance: 1856400.25, updated_at: new Date().toISOString() },
  { user_id: "u", currency: "KES", balance: 84320, updated_at: new Date().toISOString() },
  { user_id: "u", currency: "USDT", balance: 310.75, updated_at: new Date().toISOString() },
];

const rows: UnifiedActivity[] = [
  {
    id: "1", source: "deposit", type: "deposit", direction: "in", amount: 250000,
    currency: "NGN", status: "completed", reference: "bu_tr_8f31a90c", targetCurrency: null,
    targetAmount: null, title: "NGN deposit", created_at: new Date().toISOString(),
  },
  {
    id: "2", source: "transaction", type: "convert", direction: "out", amount: 500,
    currency: "USD", status: "processing", reference: "bu_tr_c7210b44", targetCurrency: "NGN",
    targetAmount: 762500, title: "USD to NGN", created_at: new Date().toISOString(),
  },
  {
    id: "3", source: "transaction", type: "withdrawal", direction: "out", amount: 120000,
    currency: "NGN", status: "pending", reference: null, targetCurrency: "NGN",
    targetAmount: 118800, title: "Withdrawal to NGN",
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "4", source: "bill", type: "electricity", direction: "out", amount: 15000,
    currency: "NGN", status: "failed", reference: "vt_9920", targetCurrency: null,
    targetAmount: null, title: "Electricity — Ikeja Electric",
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
];

export default function DesignCheck() {
  return (
    <div className="flex min-h-screen-dvh bg-background">
      <Sidebar isAdmin />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
          <MobileTopBar title="Home" />
          <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
            <Banner tone="warning" title="Verify your identity to withdraw"
              action={{ href: "/onboarding/kyc", label: "Start verification" }}>
              It takes a couple of minutes. You can deposit and convert in the meantime.
            </Banner>

            <section>
              <SectionHeader title="Your wallets" />
              <WalletCards wallets={wallets} />
            </section>

            <section>
              <SectionHeader title="Quick actions" />
              <QuickActions />
            </section>

            <section>
              <SectionHeader title="Today's rates" />
              <RatesStrip rates={[
                { base: "USD", quote: "NGN", customerRate: 1525.4 },
                { base: "USDT", quote: "NGN", customerRate: 1518.22 },
                { base: "USD", quote: "GHS", customerRate: null },
                { base: "USD", quote: "KES", customerRate: 129.44 },
              ]} />
            </section>

            <section>
              <SectionHeader title="Recent activity" action={{ href: "/transactions", label: "See all" }} />
              <ActivityRows rows={rows} />
            </section>

            <section>
              <SectionHeader title="Detail furniture" />
              <Card>
                <div className="mb-3 flex flex-col items-center gap-2">
                  <p className="font-display text-3xl font-semibold tabular-nums text-foreground">₦1,856,400.25</p>
                  <StatusPill status="completed" />
                </div>
                <DetailRow label="Rate" mono>1 USD = ₦1,525.40</DetailRow>
                <DetailRow label="Our spread">0.50%</DetailRow>
                <DetailRow label="Reference" mono>bu_tr_8f31a90c7721</DetailRow>
                <DetailRow label="New balance">₦1,856,400.25</DetailRow>
              </Card>
            </section>

            <section>
              <SectionHeader title="Token + skeleton + empty" />
              <div className="space-y-3">
                <CopyField label="Meter token" value="5421 8830 1192 4471 0028" emphasis />
                <SkeletonRows rows={2} />
                <EmptyState title="No activity yet"
                  body="Deposits, conversions, withdrawals and bill payments all land here."
                  action={{ href: "/convert", label: "Convert some money" }} />
              </div>
            </section>
          </div>
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
}

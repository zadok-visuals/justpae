import { notFound } from "next/navigation";
import { WalletCards } from "@/components/home/WalletCards";
import { QuickActions } from "@/components/home/QuickActions";
import { BuySellRates } from "@/components/rates/BuySellRates";
import { ActivityRows } from "@/components/transactions/ActivityRows";
import { ActivityFilters } from "@/components/transactions/ActivityFilters";
import {
  SectionHeader,
  Banner,
  Card,
  EmptyState,
  SkeletonRows,
  SkeletonForm,
  DetailRow,
  StatusPill,
  Pill,
} from "@/components/ui/Primitives";
import { CopyField } from "@/components/ui/CopyButton";
import { Button } from "@/components/ui/Button";
import { BottomTabBar, Sidebar, TopBar, MobileTopBar } from "@/components/layout/DashboardChrome";
import { PageTitleProvider, PageTitlePublisher } from "@/components/layout/PageTitleContext";
import { ConvertForm } from "@/components/convert/ConvertForm";
import { WithdrawForm } from "@/components/withdraw/WithdrawForm";
import { DepositForm } from "@/components/deposit/DepositForm";
import { BillForm } from "@/components/bills/BillForm";
import { IndividualKycForm, BusinessKycForm } from "@/components/kyc/KycForms";
import { RecipientCard } from "@/components/settings/RecipientCard";
import { TransactionPinCard } from "@/components/settings/TransactionPinCard";
import { billersFor } from "@/lib/providers/bills";
import { kycIdFieldFor } from "@/lib/countries";
import type { RouteAvailability } from "@/lib/actions/convert";
import type { DepositAvailability } from "@/lib/deposits/availability";
import type { UnifiedActivity } from "@/lib/transactions";
import type { Wallet, WithdrawalRecipient } from "@/lib/types/database";

/**
 * The KYC forms need a user id because their uploads go direct to the user's
 * own storage folder. In the gallery nothing is ever uploaded — picking a file
 * here would attempt a write this fixture id has no session for, and fail with
 * the form's own friendly error, which is itself a state worth being able to
 * look at.
 */
const GALLERY_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * A development-only component gallery.
 *
 * Why it exists: every screen in this app is behind a session, a KYC status and
 * a live provider, so the only way to look at the real components at 375px and
 * 1440px — the viewport check this project requires before any UI commit — is
 * to mount them with fixture props. Reading the JSX is not the same as seeing a
 * 36px tap target next to a 44px one.
 *
 * It is NOT a route users can reach: notFound() in any non-development build.
 * The fixtures are obviously fake (placeholder names, .test domains) and the
 * server actions the forms post to are the real ones, so submitting anything
 * here fails against the real auth gate rather than doing something.
 */

const wallets: Wallet[] = [
  { user_id: "u", currency: "USD", balance: 1240.5, updated_at: new Date().toISOString() },
  { user_id: "u", currency: "NGN", balance: 1856400.25, updated_at: new Date().toISOString() },
  { user_id: "u", currency: "GHS", balance: 0, updated_at: new Date().toISOString() },
  { user_id: "u", currency: "KES", balance: 84320, updated_at: new Date().toISOString() },
  { user_id: "u", currency: "USDT", balance: 310.75, updated_at: new Date().toISOString() },
];

const rows: UnifiedActivity[] = [
  {
    id: "1",
    source: "deposit",
    type: "deposit",
    direction: "in",
    amount: 250000,
    currency: "NGN",
    status: "completed",
    reference: "bu_tr_8f31a90c",
    targetCurrency: null,
    targetAmount: null,
    title: "NGN deposit",
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    source: "transaction",
    type: "convert",
    direction: "out",
    amount: 500,
    currency: "USD",
    status: "processing",
    reference: "bu_tr_c7210b44",
    targetCurrency: "NGN",
    targetAmount: 762500,
    title: "USD to NGN",
    created_at: new Date().toISOString(),
  },
  {
    id: "3",
    source: "transaction",
    type: "withdrawal",
    direction: "out",
    amount: 120000,
    currency: "NGN",
    status: "pending",
    reference: null,
    targetCurrency: "NGN",
    targetAmount: 118800,
    title: "Withdrawal to NGN",
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "4",
    source: "bill",
    type: "electricity",
    direction: "out",
    amount: 15000,
    currency: "NGN",
    status: "failed",
    reference: "bill_9920",
    targetCurrency: null,
    targetAmount: null,
    title: "Electricity — Ikeja Electric",
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
];

/** GHS deliberately unavailable: it has no USDT pair, and the greyed-out
    destination is the thing most worth looking at on the convert screen. */
const routes: RouteAvailability[] = [
  { to: "NGN", available: true, reason: null, customerRate: 1525.4 },
  { to: "KES", available: true, reason: null, customerRate: 129.44 },
  { to: "USDT", available: true, reason: null, customerRate: 0.998 },
  { to: "GHS", available: false, reason: "No cedi pair is quotable right now.", customerRate: null },
];

const depositAvailability: Record<string, DepositAvailability> = {
  USD: { available: false, reason: "Dollar deposits arrive through /receive." },
  NGN: { available: true, provider: "busha" },
  KES: { available: true, provider: "busha" },
  USDT: { available: true, provider: "busha" },
  // Matches depositAvailability's real wording. A gallery fixture that says
  // something the product no longer says is a fixture that teaches the wrong
  // copy to whoever reads it next.
  GHS: {
    available: false,
    reason:
      "Cedi deposits are under maintenance while we finish setup with our Ghana collection partner. We'll let you know the moment they're back.",
  },
};

const recipients: WithdrawalRecipient[] = [
  {
    user_id: "u",
    currency: "NGN",
    account_holder_name: "Placeholder Name",
    bank_name: "Example Bank",
    bank_code: "000",
    bank_account_number: "0123456789",
    wallet_address: null,
    network: null,
    busha_recipient_id: null,
    pending_change_requested_at: null,
    recipient_changed_at: null,
    recipient_changed_by: null,
    created_at: new Date().toISOString(),
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-6">
      <SectionHeader title={title} />
      {children}
    </section>
  );
}

export default function DevGallery() {
  // Never reachable in a deployed build.
  if (process.env.NODE_ENV !== "development") notFound();

  const electricityBillers = billersFor("NG", "electricity");

  return (
    <PageTitleProvider>
    <div className="flex h-screen-dvh flex-col overflow-hidden bg-background">
      <PageTitlePublisher title="Component gallery" />
      <TopBar userName="Ada Gallery" />
      <div className="flex min-h-0 flex-1">
      <Sidebar isAdmin />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
          <MobileTopBar title="Component gallery" />
          <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
            <Banner
              tone="warning"
              title="Verify your identity to withdraw"
              action={{ href: "/onboarding/kyc", label: "Start verification" }}
            >
              It takes a couple of minutes. You can deposit and convert in the meantime.
            </Banner>

            <section>
              <SectionHeader title="Your wallets" />
              <WalletCards wallets={wallets} />
            </section>

            <section>
              <SectionHeader title="Quick actions" />
              <QuickActions wallets={wallets} />
            </section>

            <section>
              <SectionHeader title="Today's rates" />
              <BuySellRates
                variant="strip"
                rates={[
                  { currency: "NGN", buyPrice: 1387.65, sellPrice: 1357.44, unavailableReason: null },
                  {
                    currency: "GHS",
                    buyPrice: null,
                    sellPrice: null,
                    unavailableReason:
                      "USDT/GHS isn't quoted by our liquidity provider yet, so this route is unavailable. Convert via another wallet in the meantime.",
                  },
                  { currency: "KES", buyPrice: 130.08, sellPrice: 128.11, unavailableReason: null },
                ]}
              />
            </section>

            <section>
              <SectionHeader
                title="Recent activity"
                action={{ href: "/transactions", label: "See all" }}
              />
              <ActivityRows rows={rows} />
            </section>

            <Section title="Activity filters">
              <ActivityFilters />
            </Section>

            <Section title="Convert">
              <ConvertForm
                wallets={wallets}
                routes={routes}
                hasPin
                initialFrom="NGN"
                rateBoard={[
                  { currency: "NGN", buyPrice: 1387.65, sellPrice: 1357.44, unavailableReason: null },
                  { currency: "KES", buyPrice: 130.08, sellPrice: 128.11, unavailableReason: null },
                ]}
              />
            </Section>

            <Section title="Withdraw">
              <WithdrawForm
                wallets={wallets}
                recipients={recipients}
                hasPin
                kycApproved
                kycStatus="approved"
                kycType="individual"
                hasBasics
                rejectionReason={null}
              />
            </Section>

            <Section title="Withdraw — no destination yet">
              <WithdrawForm
                wallets={wallets}
                recipients={[]}
                hasPin
                kycApproved
                kycStatus="approved"
                kycType="individual"
                hasBasics
                rejectionReason={null}
              />
            </Section>

            <Section title="Add money">
              <DepositForm wallets={wallets} availability={depositAvailability} />
            </Section>

            <Section title="Bills — electricity, provider off">
              <BillForm
                category="electricity"
                billers={electricityBillers}
                wallets={wallets}
                hasPin
                available={false}
              />
            </Section>

            <Section title="Bills — electricity, provider on">
              <BillForm
                category="electricity"
                billers={electricityBillers}
                wallets={wallets}
                hasPin
                available
              />
            </Section>

            <Section title="Verification — individual">
              <IndividualKycForm
                idField={kycIdFieldFor("NG")}
                defaultFullName=""
                rejectionReason="The photo of your ID was too blurry to read. Try again in daylight."
                userId={GALLERY_USER_ID}
                usesBvnOrNin
              />
            </Section>

            <Section title="Verification — business">
              <BusinessKycForm defaultBusinessName="" rejectionReason={null} userId={GALLERY_USER_ID} />
            </Section>

            <Section title="Transaction PIN">
              <div className="space-y-4">
                <TransactionPinCard hasPin={false} />
                <TransactionPinCard hasPin />
              </div>
            </Section>

            <Section title="Payout destinations">
              <RecipientCard
                currencies={["NGN", "GHS", "KES", "USDT"]}
                recipients={recipients}
                banks={[
                  { code: "000", name: "Example Bank" },
                  { code: "001", name: "Second Example Bank" },
                ]}
              />
            </Section>

            <Section title="Detail furniture">
              <Card>
                <div className="mb-3 flex flex-col items-center gap-2">
                  <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
                    ₦1,856,400.25
                  </p>
                  <StatusPill status="completed" />
                </div>
                <DetailRow label="Rate" mono>
                  1 USD = ₦1,525.40
                </DetailRow>
                <DetailRow label="Our spread">0.50%</DetailRow>
                <DetailRow label="Reference" mono>
                  bu_tr_8f31a90c7721
                </DetailRow>
                <DetailRow label="New balance">₦1,856,400.25</DetailRow>
              </Card>
            </Section>

            <Section title="Status pills">
              <div className="flex flex-wrap gap-2">
                <StatusPill status="pending" />
                <StatusPill status="processing" />
                <StatusPill status="completed" />
                <StatusPill status="failed" />
                <StatusPill status="refunded" />
                <Pill>Neutral</Pill>
              </div>
            </Section>

            <Section title="Buttons">
              <div className="flex flex-wrap gap-2">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="ghost">Ghost</Button>
                <Button loading>Submitting</Button>
                <Button disabled>Disabled</Button>
              </div>
            </Section>

            <Section title="Token, skeletons, empty state">
              <div className="space-y-3">
                <CopyField label="Meter token" value="5421 8830 1192 4471 0028" emphasis />
                <SkeletonRows rows={2} />
                <SkeletonForm fields={2} />
                <EmptyState
                  title="No activity yet"
                  body="Deposits, conversions, withdrawals and bill payments all land here."
                  action={{ href: "/convert", label: "Convert some money" }}
                />
              </div>
            </Section>
          </div>
        </main>
      </div>
      </div>
      <BottomTabBar />
    </div>
    </PageTitleProvider>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { Card, Pill, Banner, DetailRow, SkeletonCard } from "@/components/ui/Primitives";
import { SubmitButton } from "@/components/ui/Button";
import { TransactionPinCard } from "@/components/settings/TransactionPinCard";
import { RecipientCard } from "@/components/settings/RecipientCard";
import { EmailPreferenceToggle } from "@/components/settings/EmailPreferenceToggle";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
import { logOut } from "@/lib/actions/auth";
import { isAdmin } from "@/lib/auth/admin";
import { getBanks, type BushaBank } from "@/lib/busha/client";
import { withoutCny } from "@/lib/ui/currencyPicker";
import { countryName } from "@/lib/countries";
import { startRouteTiming } from "@/lib/perf/timing";
import { getThemePreference } from "@/lib/theme";
import type { Currency, Wallet, WithdrawalRecipient } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/**
 * Profile — the fifth tab, and where everything account-shaped lives:
 * verification status, the transaction PIN, payout destinations, sign out.
 *
 * There is no separate settings page. A profile screen and a settings screen
 * both listing the same five things is one navigation item too many.
 */
export default async function ProfilePage() {
  const endRouteTiming = startRouteTiming("/profile");
  const supabase = await createClient();
  const user = await requireSessionUser();

  const [
    { data: profile },
    { data: wallets },
    { data: recipients },
    { data: hasPin },
    showAdmin,
    themePreference,
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, phone, business_name, kyc_status, kyc_type, country, email_announcements")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("wallets").select("*").eq("user_id", user.id),
      supabase.from("withdrawal_recipients").select("*").eq("user_id", user.id),
      // has_transaction_pin() rather than selecting from withdrawal_pins: the
      // select policy that allowed that also allowed selecting pin_hash, so it
      // was dropped in 0012. This asks the only question the card needs.
      supabase.rpc("has_transaction_pin"),
      // Admin is a database role now, not an email match, so this is a query
      // rather than a string compare — hence its place in this batch.
      isAdmin(user.id, user.email),
      // GROUP 9. Cookie-backed, not a column — nothing here is per-account,
      // so there is no row to join and no reason to add one.
      getThemePreference(),
    ]);

  endRouteTiming();

  // USD is excluded: there is no payout channel for it on this account. USD is
  // spent by converting it, so offering a USD destination would be offering
  // something that can never be used. CNY goes through the same `withoutCny`
  // Withdraw uses — the database refuses a yuan payout outright.
  const payoutCurrencies = withoutCny((wallets ?? []) as Wallet[])
    .map((w) => w.currency)
    .filter((c): c is Currency => c !== "USD");

  const kycStatus = profile?.kyc_status ?? "not_started";

  return (
    <PageShell title="Profile">
      <div className="space-y-4">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">
                {profile?.full_name ?? profile?.email ?? "Your account"}
              </p>
              <p className="truncate text-sm text-muted-foreground">{profile?.email}</p>
            </div>
            <Pill
              tone={
                kycStatus === "approved"
                  ? "success"
                  : kycStatus === "rejected"
                    ? "failed"
                    : kycStatus === "pending"
                      ? "pending"
                      : "neutral"
              }
            >
              {kycStatus === "approved"
                ? "Verified"
                : kycStatus === "pending"
                  ? "In review"
                  : kycStatus === "rejected"
                    ? "Rejected"
                    : "Unverified"}
            </Pill>
          </div>

          <div className="mt-3">
            {profile?.phone && <DetailRow label="Phone">{profile.phone}</DetailRow>}
            {profile?.country && (
              <DetailRow label="Country">{countryName(profile.country)}</DetailRow>
            )}
            {profile?.business_name && (
              <DetailRow label="Business">{profile.business_name}</DetailRow>
            )}
          </div>
        </Card>

        {kycStatus !== "approved" && (
          <Banner
            tone={kycStatus === "rejected" ? "danger" : "warning"}
            title={
              kycStatus === "pending"
                ? "We're reviewing your documents"
                : kycStatus === "rejected"
                  ? "We couldn't verify your details"
                  : "Verify your identity to withdraw"
            }
            action={{
              href: kycStatus === "pending" ? "/onboarding/kyc/status" : "/onboarding/kyc",
              label: kycStatus === "pending" ? "Check status" : "Start now",
            }}
          >
            {kycStatus === "pending"
              ? "You can deposit and convert in the meantime."
              : "Required before money can leave your account."}
          </Banner>
        )}

        <TransactionPinCard hasPin={hasPin === true} />

        <EmailPreferenceToggle initialEnabled={profile?.email_announcements ?? true} />

        <ThemeToggle initialPreference={themePreference} />

        {/* GROUP 9c. The bank list is a PROVIDER call, and it was awaited in
            the page body — so the whole of Profile (name, verification
            status, PIN card, admin link, sign-out) waited on an HTTP request
            to a third party before any of it rendered. None of those things
            needs a bank list.

            It is also the one call on this page that can be slow for a
            reason entirely outside the product: the list is fetched fresh on
            every view and has nothing to do with the user. */}
        {payoutCurrencies.length > 0 && (
          <Suspense fallback={<SkeletonCard className="h-48" />}>
            <PayoutRecipients
              currencies={payoutCurrencies}
              recipients={(recipients ?? []) as WithdrawalRecipient[]}
            />
          </Suspense>
        )}

        {showAdmin && (
          <Card>
            <h2 className="text-base font-semibold text-foreground">Admin</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Verification queue, withdrawal queue, rates and margin.
            </p>
            <Link
              href="/admin"
              className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary"
            >
              Open admin →
            </Link>
          </Card>
        )}

        {/* HELP AND LEGAL.
            Support was reachable only from an icon in the desktop header and
            nowhere at all in the mobile chrome; Terms and Privacy were linked
            from the public footer, which a signed-in user never sees again
            after they log in. A user who has agreed to terms is entitled to
            re-read them without signing out to find them. */}
        <Card>
          <h2 className="text-base font-semibold text-foreground">Help and legal</h2>
          <ul className="mt-1">
            {[
              { href: "/support", label: "Contact support", hint: "Chat with our team" },
              {
                href: "/onboarding/kyc/status",
                label: "Verification status",
                hint: "What we have on file",
              },
              { href: "/terms", label: "Terms of service", hint: null },
              { href: "/privacy", label: "Privacy policy", hint: null },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{item.label}</span>
                    {item.hint && (
                      <span className="block text-xs text-muted-foreground">{item.hint}</span>
                    )}
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <form action={logOut}>
          {/* SubmitButton, not a plain Button: sign-out ends in a redirect and
              the round trip is visible, so the button has to disable and spin
              like every other submit in the app. */}
          <SubmitButton variant="secondary" size="md" pendingLabel="Signing out…">
            Sign out
          </SubmitButton>
        </form>
      </div>
    </PageShell>
  );
}

/**
 * GROUP 9c — the payout-destination card, with its provider call inside the
 * Suspense boundary rather than in the page body.
 *
 * The try/catch is unchanged in substance and still matters: the bank list
 * comes from the provider, which expects its OWN codes rather than standard
 * national ones, and a failure must leave the form showing no bank options —
 * which is honest — rather than taking out the page. What changed is WHERE
 * the failure happens: inside a boundary, after the rest of Profile is
 * already on screen.
 */
async function PayoutRecipients({
  currencies,
  recipients,
}: {
  currencies: Currency[];
  recipients: WithdrawalRecipient[];
}) {
  let banks: BushaBank[] = [];
  try {
    banks = await getBanks();
  } catch (err) {
    console.error("[profile] bank list unavailable", err);
  }

  return <RecipientCard currencies={currencies} recipients={recipients} banks={banks} />;
}

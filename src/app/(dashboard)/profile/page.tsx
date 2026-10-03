import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/PageShell";
import { Card, Pill, Banner, DetailRow } from "@/components/ui/Primitives";
import { SubmitButton } from "@/components/ui/Button";
import { TransactionPinCard } from "@/components/settings/TransactionPinCard";
import { RecipientCard } from "@/components/settings/RecipientCard";
import { logOut } from "@/lib/actions/auth";
import { isAdminEmail } from "@/lib/auth/admin";
import { getBanks, type BushaBank } from "@/lib/busha/client";
import { countryName } from "@/lib/countries";
import type { Currency, Wallet, WithdrawalRecipient } from "@/lib/types/database";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: wallets }, { data: recipients }, { data: pin }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, phone, business_name, kyc_status, kyc_type, country")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("wallets").select("*").eq("user_id", user.id),
      supabase.from("withdrawal_recipients").select("*").eq("user_id", user.id),
      supabase.from("withdrawal_pins").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);

  // The bank list comes from the provider, which expects its OWN codes rather
  // than standard national ones. A failure here must not break the whole
  // profile page — the recipient form falls back to showing no bank options,
  // which is honest, rather than letting the page 500.
  let banks: BushaBank[] = [];
  try {
    banks = await getBanks();
  } catch (err) {
    console.error("[profile] bank list unavailable", err);
  }

  // USD is excluded: there is no payout channel for it on this account. USD is
  // spent by converting it, so offering a USD destination would be offering
  // something that can never be used.
  const payoutCurrencies = ((wallets ?? []) as Wallet[])
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

        <TransactionPinCard hasPin={pin != null} />

        {payoutCurrencies.length > 0 && (
          <RecipientCard
            currencies={payoutCurrencies}
            recipients={(recipients ?? []) as WithdrawalRecipient[]}
            banks={banks}
          />
        )}

        {isAdminEmail(user.email) && (
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

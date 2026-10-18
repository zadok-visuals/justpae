import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Banner } from "@/components/ui/Primitives";
import { KycTypeSelector } from "@/components/kyc/KycTypeSelector";
import { phoneHintFor } from "@/lib/countries";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Finish setting up" };
export const dynamic = "force-dynamic";

/**
 * STAGE ONE of onboarding: account type and phone number.
 *
 * This used to be a chooser whose two options led straight into a full
 * document submission, which made identity verification the first thing a new
 * user saw. It is now two questions and a button to the dashboard; the ID
 * itself is stage two, offered from the Home banner whenever the user chooses.
 *
 * Nothing here is mandatory to use the app — only to withdraw.
 */
export default async function OnboardingBasicsPage() {
  const supabase = await createClient();
  const user = await requireSessionUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, country, kyc_type, kyc_status, kyc_rejection_reason")
    .eq("id", user.id)
    .maybeSingle();

  // Already in review or approved: the status page is the only useful
  // destination. Re-asking for an account type would be offering to change
  // something migration 0020 refuses to change.
  if (profile?.kyc_status === "pending" || profile?.kyc_status === "approved") {
    redirect("/onboarding/kyc/status");
  }

  // Stage one is already done, so this page has nothing left to ask. Straight
  // on to the matching ID form rather than making them answer twice.
  if (profile?.phone && profile?.kyc_type) {
    redirect(
      profile.kyc_type === "business"
        ? "/onboarding/kyc/business"
        : "/onboarding/kyc/individual",
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Let&apos;s finish setting up
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Two quick details and you&apos;re in. You can send us your ID later, from your
          dashboard, whenever it suits you.
        </p>
      </div>

      {profile?.kyc_status === "rejected" && profile.kyc_rejection_reason && (
        <Banner tone="danger" title="Your last submission needs another look">
          {profile.kyc_rejection_reason}
        </Banner>
      )}

      <KycTypeSelector
        // Country-aware: a Ghanaian shown "+234…" is being told the product
        // was built for Nigeria.
        phoneHint={phoneHintFor(profile?.country)}
        defaultPhone={profile?.phone ?? ""}
        defaultType={(profile?.kyc_type as "individual" | "business" | null) ?? null}
      />
    </div>
  );
}

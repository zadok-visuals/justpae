import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BusinessKycForm } from "@/components/kyc/KycForms";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Verify your business" };
export const dynamic = "force-dynamic";

export default async function BusinessKycPage() {
  const supabase = await createClient();
  const user = await requireSessionUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, phone, kyc_type, kyc_status, kyc_rejection_reason")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.kyc_status === "pending" || profile?.kyc_status === "approved") {
    redirect("/onboarding/kyc/status");
  }

  // The mirror of the guard on the individual page: a resubmitting individual
  // must not be shown the business form and have their kyc_type flipped.
  if (profile?.kyc_type === "individual") redirect("/onboarding/kyc/individual");

  // Stage one skipped — see the individual page for why this goes back rather
  // than rendering a form whose submission cannot succeed.
  if (!profile?.phone || !profile?.kyc_type) redirect("/onboarding/kyc");

  return (
    <div className="space-y-5">
      {/* GROUP 5a — removed for the same reason as the individual form's:
          /onboarding/kyc redirects straight back here. The wizard's own Back
          is the one control, and from step 1 it leaves the wizard. */}
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Verify your business</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Four steps. Everything here goes to a human reviewer, and we don&apos;t share it.
        </p>
      </div>

      <BusinessKycForm
        defaultBusinessName={profile?.business_name ?? ""}
        rejectionReason={profile?.kyc_rejection_reason ?? null}
        // See the individual form: files go direct to storage from the
        // browser, under the user's own folder.
        userId={user.id}
      />
    </div>
  );
}

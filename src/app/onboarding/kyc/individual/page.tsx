import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IndividualKycForm } from "@/components/kyc/KycForms";
import { kycIdFieldFor, usesBvnOrNin } from "@/lib/countries";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Verify your identity" };
export const dynamic = "force-dynamic";

export default async function IndividualKycPage() {
  const supabase = await createClient();
  const user = await requireSessionUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, country, kyc_type, kyc_status, kyc_rejection_reason")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.kyc_status === "pending" || profile?.kyc_status === "approved") {
    redirect("/onboarding/kyc/status");
  }

  // A rejected business account that lands here — from a stale link or a
  // bookmark — would otherwise be shown the individual form and silently have
  // its kyc_type flipped on submit, leaving the business documents orphaned
  // against an individual submission.
  if (profile?.kyc_type === "business") redirect("/onboarding/kyc/business");

  // Stage one skipped: this form no longer asks for a phone number, so without
  // it the submission would fail inside the action. Back one stage instead of
  // showing a form that cannot succeed.
  if (!profile?.phone || !profile?.kyc_type) redirect("/onboarding/kyc");

  return (
    <div className="space-y-5">
      {/* GROUP 5a. The `← Back` link that was here pointed at
          /onboarding/kyc, which redirects straight back to this page for
          anyone who has reached it — a no-op costing a round trip (QA 4.1),
          sitting directly above the wizard's own working Back button. There
          is now exactly one Back on this screen: WizardNav's, which steps
          backwards through the form and leaves the wizard from step 1. */}
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Submit your ID</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Two steps. Everything here goes to a human reviewer, and we don&apos;t share it.
        </p>
      </div>

      <IndividualKycForm
        // Resolved on the server from the user's own country, so the form
        // never has to guess which document a country uses.
        idField={kycIdFieldFor(profile.country)}
        defaultFullName={profile.full_name ?? ""}
        rejectionReason={profile.kyc_rejection_reason ?? null}
        // Needed in the browser because the files are uploaded direct to
        // storage from there, and the user id is the first path segment the
        // bucket policy confines them to.
        userId={user.id}
        // Decided here, not in the browser: it chooses which fields the server
        // then validates, so it must not be something a client can assert.
        usesBvnOrNin={usesBvnOrNin(profile.country)}
      />
    </div>
  );
}

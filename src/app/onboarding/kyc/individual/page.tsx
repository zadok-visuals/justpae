import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IndividualKycForm } from "@/components/kyc/KycForms";
import { kycIdFieldFor } from "@/lib/countries";

export const metadata = { title: "Verify your identity" };
export const dynamic = "force-dynamic";

export default async function IndividualKycPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, country, kyc_status, kyc_rejection_reason")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.kyc_status === "pending" || profile?.kyc_status === "approved") {
    redirect("/onboarding/kyc/status");
  }

  return (
    <div className="space-y-5">
      <Link
        href="/onboarding/kyc"
        className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground"
      >
        ← Back
      </Link>

      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Your details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything here goes to a human reviewer. We don&apos;t share it.
        </p>
      </div>

      <IndividualKycForm
        // Resolved on the server from the user's own country, so the form
        // never has to guess which document a country uses.
        idField={kycIdFieldFor(profile?.country)}
        defaultFullName={profile?.full_name ?? ""}
        defaultPhone={profile?.phone ?? ""}
        rejectionReason={profile?.kyc_rejection_reason ?? null}
      />
    </div>
  );
}

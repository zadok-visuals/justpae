import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BusinessKycForm } from "@/components/kyc/KycForms";

export const metadata = { title: "Verify your business" };
export const dynamic = "force-dynamic";

export default async function BusinessKycPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, kyc_status, kyc_rejection_reason")
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
        <h1 className="font-display text-2xl font-semibold text-foreground">Business details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything here goes to a human reviewer. We don&apos;t share it.
        </p>
      </div>

      <BusinessKycForm
        defaultBusinessName={profile?.business_name ?? ""}
        rejectionReason={profile?.kyc_rejection_reason ?? null}
      />
    </div>
  );
}

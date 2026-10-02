import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Banner } from "@/components/ui/Primitives";

export const metadata = { title: "Verify your identity" };
export const dynamic = "force-dynamic";

export default async function KycTypePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("kyc_status")
    .eq("id", user.id)
    .maybeSingle();

  // Already submitted or approved: the status page is the useful destination,
  // not a form that would overwrite a submission under review.
  if (profile?.kyc_status === "pending" || profile?.kyc_status === "approved") {
    redirect("/onboarding/kyc/status");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Verify your identity
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Required before money can leave your account. You can deposit and convert without it.
        </p>
      </div>

      {profile?.kyc_status === "rejected" && (
        <Banner tone="danger" title="Your last submission was rejected">
          Pick the same type you used before and resubmit — the details of what went wrong are on
          the next screen.
        </Banner>
      )}

      <div className="space-y-3">
        <Link
          href="/onboarding/kyc/individual"
          className="block rounded-xl border border-border bg-card p-4"
        >
          <span className="block text-base font-semibold text-foreground">
            I&apos;m an individual
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Your name, phone number, ID number and a selfie. Takes about two minutes.
          </span>
        </Link>

        <Link
          href="/onboarding/kyc/business"
          className="block rounded-xl border border-border bg-card p-4"
        >
          <span className="block text-base font-semibold text-foreground">
            I&apos;m a business
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Your registration certificate, tax number and a director&apos;s ID.
          </span>
        </Link>
      </div>
    </div>
  );
}

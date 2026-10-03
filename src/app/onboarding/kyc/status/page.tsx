import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Banner, Card, Pill } from "@/components/ui/Primitives";

export const metadata = { title: "Verification status" };
export const dynamic = "force-dynamic";

export default async function KycStatusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: documents }] = await Promise.all([
    supabase
      .from("profiles")
      .select("kyc_status, kyc_type, kyc_rejection_reason")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("kyc_documents")
      .select("document_type, status")
      .eq("user_id", user.id)
      .order("created_at"),
  ]);

  const status = profile?.kyc_status ?? "not_started";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Verification status
        </h1>
      </div>

      {status === "approved" && (
        <Banner tone="success" title="You're verified" action={{ href: "/home", label: "Go to home" }}>
          Withdrawals are open. Nothing else to do here.
        </Banner>
      )}

      {status === "pending" && (
        <Banner tone="info" title="We're reviewing your documents">
          This usually takes a few hours. You can deposit and convert in the meantime — we&apos;ll
          let you know as soon as it&apos;s done.
        </Banner>
      )}

      {status === "rejected" && (
        <Banner
          tone="danger"
          title="We couldn't verify your details"
          action={{ href: "/onboarding/kyc", label: "Submit again" }}
        >
          {/* The actual reason. A generic "please resubmit" guarantees the
              second attempt fails for the same thing as the first. */}
          {profile?.kyc_rejection_reason ??
            "Please check your documents are clear and readable, then submit again."}
        </Banner>
      )}

      {status === "not_started" && (
        <Banner
          tone="warning"
          title="You haven't started yet"
          action={{ href: "/onboarding/kyc", label: "Start verification" }}
        >
          It takes about two minutes.
        </Banner>
      )}

      {documents && documents.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            What you sent
          </h2>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.document_type}
                className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
              >
                <span className="text-sm text-foreground">
                  {doc.document_type.replace(/_/g, " ")}
                </span>
                <Pill
                  tone={
                    doc.status === "approved"
                      ? "success"
                      : doc.status === "rejected"
                        ? "failed"
                        : "pending"
                  }
                >
                  {doc.status}
                </Pill>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Link
        href="/home"
        className="mx-auto flex min-h-11 w-fit items-center px-3 text-sm font-medium text-primary"
      >
        Back to home
      </Link>
    </div>
  );
}

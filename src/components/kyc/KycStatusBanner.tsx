import Link from "next/link";
import { Banner } from "@/components/ui/Primitives";

/**
 * The one-line form Home uses: a sentence and a Verify pill, not a titled
 * box with a paragraph in it. Home already has a lot to say, and the full
 * banner's three lines pushed the balance below the fold on a 360px screen.
 */
function CompactBanner({
  tone,
  message,
  action,
}: {
  tone: "info" | "warning" | "danger";
  message: string;
  action: { href: string; label: string };
}) {
  const tones = {
    info: "border-border bg-secondary",
    warning: "border-warning/40 bg-warning-soft",
    danger: "border-destructive/40 bg-destructive/10",
  } as const;

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <p className="min-w-0 flex-1 truncate text-sm text-foreground">{message}</p>
      <Link
        href={action.href}
        className="inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        {action.label}
      </Link>
    </div>
  );
}

/**
 * The one place that decides what to say about an unfinished identity check,
 * and where to send the user next.
 *
 * It is a BANNER, never a gate. The dashboard stays fully usable with this on
 * screen: deposits and conversions work unverified, and only withdrawal
 * actually needs approval. A product that blocks the dashboard until a
 * document is approved is a product nobody gets far enough into to send a
 * document to.
 *
 * The destination depends on how far the user actually got, which is why this
 * takes `phone` and `kycType` and not just a status. Sending someone who has
 * already picked "business" back to the account-type question is the fastest
 * way to make them stop.
 */
export function KycStatusBanner({
  status,
  phone,
  kycType,
  rejectionReason,
  compact = false,
}: {
  status: string | null | undefined;
  phone: string | null | undefined;
  kycType: string | null | undefined;
  rejectionReason: string | null | undefined;
  /** Home's one-line form. */
  compact?: boolean;
}) {
  if (status === "approved") return null;

  /** The ID form matching the type the user already chose. */
  const idFormHref =
    kycType === "business" ? "/onboarding/kyc/business" : "/onboarding/kyc/individual";

  if (compact) {
    if (status === "pending") {
      return (
        <CompactBanner
          tone="info"
          message="We're reviewing your details."
          action={{ href: "/onboarding/kyc/status", label: "View" }}
        />
      );
    }
    if (status === "rejected") {
      return (
        <CompactBanner
          tone="danger"
          message="We couldn't verify your details."
          action={{ href: idFormHref, label: "Resubmit" }}
        />
      );
    }
    return (
      <CompactBanner
        tone="warning"
        message="Verify your identity to withdraw."
        action={{ href: !phone || !kycType ? "/onboarding/kyc" : idFormHref, label: "Verify" }}
      />
    );
  }

  if (status === "pending") {
    return (
      <Banner
        tone="info"
        title="We're reviewing your details"
        action={{ href: "/onboarding/kyc/status", label: "View status" }}
      >
        You can deposit and convert while we check your documents. Withdrawals open up once
        you&apos;re verified.
      </Banner>
    );
  }

  if (status === "rejected") {
    return (
      <Banner
        tone="danger"
        title="We couldn't verify your details"
        action={{ href: idFormHref, label: "Resubmit" }}
      >
        {/* The specific reason, not a generic "please resubmit" — without it
            the next attempt is a guess and gets rejected for the same thing. */}
        {rejectionReason ?? "Please review your documents and submit them again."}
      </Banner>
    );
  }

  // not_started, and stage one hasn't happened: two quick questions, not a
  // document upload. Sending them to an ID form that needs a phone number on
  // file would strand them at its own guard.
  if (!phone || !kycType) {
    return (
      <Banner
        tone="warning"
        title="Finish setting up your account"
        action={{ href: "/onboarding/kyc", label: "Continue" }}
      >
        Two quick details. You can send us your ID later.
      </Banner>
    );
  }

  // not_started, stage one done: the ID is all that's left.
  return (
    <Banner
      tone="warning"
      title="Submit your ID"
      action={{ href: idFormHref, label: "Submit your ID" }}
    >
      Verified accounts can withdraw. It takes a couple of minutes, and you can deposit and
      convert in the meantime.
    </Banner>
  );
}

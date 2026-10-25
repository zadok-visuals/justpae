import Link from "next/link";
import { Pill } from "@/components/ui/Primitives";

/**
 * GROUP 3h — the identity check as ONE bordered line, above the banner.
 *
 * It replaces the tinted compact banner. The old one was orange, full width
 * and sat directly above a solid blue card, so the first two things on Home
 * were both shouting; this says the same sentence in the page's own voice
 * and keeps the one coloured surface the design has for the balance.
 *
 * It is still a prompt and never a gate — deposits and conversions work
 * unverified, and only withdrawal needs approval.
 */
export function KycRow({
  status,
  phone,
  kycType,
}: {
  status: string | null | undefined;
  phone: string | null | undefined;
  kycType: string | null | undefined;
}) {
  if (status === "approved") return null;

  const idFormHref =
    kycType === "business" ? "/onboarding/kyc/business" : "/onboarding/kyc/individual";

  // Where "Verify" goes depends on how far the user actually got. Sending
  // somebody who has already chosen "business" back to the account-type
  // question is the fastest way to make them stop.
  const href =
    status === "rejected"
      ? idFormHref
      : !phone || !kycType
        ? "/onboarding/kyc"
        : idFormHref;

  return (
    <div className="flex min-h-12 items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2">
      <ShieldIcon />
      <p className="min-w-0 flex-1 truncate text-[0.8125rem] text-foreground">
        {status === "rejected"
          ? "We couldn't verify your identity"
          : "Verify your identity to unlock withdrawals"}
      </p>

      {status === "pending" ? (
        <Pill tone="neutral">Under review</Pill>
      ) : (
        <Link
          href={href}
          className="inline-flex h-8 shrink-0 items-center rounded-full bg-primary-fill px-3.5 text-xs font-semibold text-primary-foreground"
        >
          {status === "rejected" ? "Resubmit" : "Verify"}
        </Link>
      )}
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="size-5 shrink-0 text-muted-foreground"
    >
      <path
        d="M12 3 5 6v5.5c0 4 2.9 7.6 7 9.5 4.1-1.9 7-5.5 7-9.5V6l-7-3Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { dismissKycPrompt } from "@/lib/actions/kycPrompt";

/**
 * GROUP 4. A modal rather than the banner for `not_started` and `rejected` —
 * the banner stays as the always-on reminder lower down the page, but an
 * unverified account is the single thing most worth a user's attention on
 * arrival, and a banner among several on a page people skim past does not
 * carry that weight. `pending` keeps the banner only: there is nothing to DO
 * yet, so interrupting with a modal would ask for an action that does not
 * exist.
 *
 * initialOpen is decided on the SERVER (src/app/(dashboard)/home/page.tsx,
 * from the cookie src/lib/actions/kycPrompt.ts reads) rather than here, so
 * there is no flash of the modal mounting open on every load before a client
 * effect has a chance to read a dismissal.
 */
export function KycPromptModal({
  initialOpen,
  rejectionReason,
}: {
  initialOpen: boolean;
  rejectionReason: string | null;
}) {
  const [open, setOpen] = useState(initialOpen);
  const titleId = useId();

  function later() {
    setOpen(false);
    // Fire-and-forget: a failed cookie write means the modal reappears
    // tomorrow at worst, which is not worth blocking the close on.
    void dismissKycPrompt();
  }

  return (
    <Modal open={open} onClose={later} labelledBy={titleId}>
      <h2 id={titleId} className="font-display text-lg font-semibold text-foreground">
        Verify your identity
      </h2>

      <p className="mt-2 text-sm text-muted-foreground">
        Verified accounts can withdraw. It takes a couple of minutes.
      </p>

      {rejectionReason && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {rejectionReason}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3">
        <Link
          href="/onboarding/kyc"
          onClick={later}
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-gold-light"
        >
          {rejectionReason ? "Try again" : "Verify now"}
        </Link>

        <button
          type="button"
          onClick={later}
          className="min-h-11 text-sm font-medium text-primary"
        >
          Later
        </button>
      </div>
    </Modal>
  );
}

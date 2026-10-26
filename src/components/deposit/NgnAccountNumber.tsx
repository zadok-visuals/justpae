"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Banner, Card, DetailRow } from "@/components/ui/Primitives";
import { CopyButton, CopyField } from "@/components/ui/CopyButton";
import { MoneyFormLayout, WhatHappensNext } from "@/components/money/MoneyFormLayout";
import { BvnPrompt } from "@/components/deposit/BvnPrompt";
import { issueNgnVirtualAccount } from "@/lib/actions/virtualAccount";
import { formatAmount } from "@/lib/currencies";
import type { VirtualAccountState } from "@/lib/korapay/virtualAccount";

/**
 * Naira deposits, as an account number the customer keeps.
 *
 * WHAT THIS REPLACES, and why the screen is so much emptier than the one
 * before it: the manual rail asked for an amount, issued a reference, asked
 * the customer to put that reference in their bank narration, then asked them
 * to come back and say they had sent it. Four chances to lose a deposit. Here
 * there is nothing to type, nothing to remember and nothing to come back for
 * — the number is theirs, and money sent to it lands.
 *
 * NO AMOUNT STEP AND NO EXPIRY, deliberately. Both existed on the rails this
 * replaces because those rails needed them; carrying them over "for
 * consistency" would reintroduce exactly the friction the change removes.
 *
 * NO PROVIDER IS NAMED anywhere in this file. The customer has an account
 * number at a bank; who issues it on our behalf is not their concern, and the
 * copy rule is product-wide.
 */

export function NgnAccountNumber({
  initial,
  depositFee,
  picker,
}: {
  /** Resolved server-side. The screen never asks the browser what account
   *  number to show. */
  initial: VirtualAccountState;
  /** The admin fee setting, in naira. A line appears only above zero. */
  depositFee: number;
  picker?: React.ReactNode;
}) {
  const [state, setState] = useState<VirtualAccountState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shell = (children: React.ReactNode) => (
    <div className="space-y-4">
      {picker}
      {children}
    </div>
  );

  function issue() {
    setError(null);
    startTransition(async () => {
      const result = await issueNgnVirtualAccount();
      if (result.error) setError(result.error);
      if (result.result) setState(result.result);
    });
  }

  // ── The KYC gate ────────────────────────────────────────────────────────
  //
  // Enforced server-side in getNgnVirtualAccount; this exists so somebody who
  // is not verified gets a way forward rather than a blank screen. The
  // wording names the stage they are actually at — "Start verification"
  // pointing at the account-type question is a dead end for someone who
  // answered it last week and only needs to send a photo.
  if (state.state === "needs_kyc") {
    const { kycStatus } = state;
    if (kycStatus === "pending") {
      return shell(
        <Banner
          tone="info"
          title="We're reviewing your details"
          action={{ href: "/onboarding/kyc/status", label: "View status" }}
        >
          Your account number is ready the moment you&apos;re verified. Everything else on
          your account carries on as normal in the meantime.
        </Banner>,
      );
    }

    return shell(
      <Banner
        tone={kycStatus === "rejected" ? "danger" : "warning"}
        title={
          kycStatus === "rejected"
            ? "We couldn't verify your details"
            : "Verify your identity to get your account number"
        }
        action={{
          href: kycStatus === "rejected" ? "/onboarding/kyc/status" : "/onboarding/kyc",
          label: kycStatus === "rejected" ? "Resubmit" : "Verify your identity",
        }}
      >
        {kycStatus === "rejected"
          ? "Please review your documents and submit them again, and we'll issue your account number."
          : "Your account number is issued in your own name, so we have to confirm who you are first. It takes a couple of minutes."}
      </Banner>,
    );
  }

  // ── The BVN gate ────────────────────────────────────────────────────────
  //
  // Asked here rather than at onboarding for everyone who verified before
  // this rail existed. Saving it issues the account straight away — making
  // them press a second button for something they have just enabled is the
  // kind of step that reads as the form not having worked.
  if (state.state === "needs_bvn") {
    return shell(<BvnPrompt masked={null} initialError={state.error} onSaved={issue} />);
  }

  if (state.state === "unavailable") {
    return shell(
      <Banner tone="warning" title="We couldn't set up your account number">
        {state.message}
      </Banner>,
    );
  }

  if (state.state === "none") {
    return shell(
      <Card className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Get your naira account number</h2>
        <p className="text-sm text-muted-foreground">
          It&apos;s yours to keep — save it in your bank app and send to it any time.
        </p>
        <Button onClick={issue} disabled={pending}>
          {pending ? "Setting it up…" : "Get my account number"}
        </Button>
        {error && (
          <Banner tone="danger" title="That didn't work" live>
            {error}
          </Banner>
        )}
      </Card>,
    );
  }

  const { account } = state;

  const summary = (
    <WhatHappensNext
      steps={[
        "Open your bank app and send any amount to the account number above.",
        "It arrives in a few minutes and your naira wallet goes up by itself.",
        "The number never changes and never expires — save it and reuse it.",
      ]}
      footnote="Nothing leaves your bank until you make the transfer yourself. We never debit you."
    />
  );

  return (
    <MoneyFormLayout summary={summary}>
      <div className="space-y-4">
        {picker}

        {/* The account number is the screen. Everything else is supporting
            detail, and the size difference says so — a number retyped by
            hand from small print is how money goes somewhere it cannot be
            recovered from. */}
        <Card className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Your naira account number
            </p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <span className="min-w-0 flex-1 break-all font-mono text-3xl font-semibold tracking-wider tabular-nums text-foreground">
                {account.account_number}
              </span>
              <CopyButton value={account.account_number} />
            </div>
          </div>

          <DetailRow label="Bank">{account.bank_name}</DetailRow>
          <DetailRow label="Account name">{account.account_name}</DetailRow>
        </Card>

        <Card>
          <p className="text-sm text-foreground">
            Send any amount from your bank app. It arrives in a few minutes.
          </p>
          {depositFee > 0 && (
            // Before the money moves rather than after. A flat charge
            // discovered on the receipt is how a support ticket gets written.
            <p className="mt-2 text-xs text-muted-foreground">
              A {formatAmount("NGN", depositFee)} deposit fee comes off each transfer before
              it reaches your wallet.
            </p>
          )}
        </Card>

        {/* Copyable again, in the plain form somebody pastes into a chat with
            whoever is sending on their behalf. */}
        <CopyField label="Account name" value={account.account_name} />
      </div>
    </MoneyFormLayout>
  );
}

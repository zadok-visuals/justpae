"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { AmountInput, parseAmount } from "@/components/ui/AmountInput";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Banner, Card, DetailRow } from "@/components/ui/Primitives";
import { CopyField } from "@/components/ui/CopyButton";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { UploadField } from "@/components/ui/UploadField";
import { LegalReminder } from "@/components/ui/LegalReminder";
import { MoneyFormLayout, WhatHappensNext } from "@/components/money/MoneyFormLayout";
import { startManualDeposit, markManualDepositSent } from "@/lib/actions/manualDeposit";
import { DEPOSIT_PROOF_BUCKET } from "@/lib/deposits/proofBucket";
import {
  isManualDepositConfigured,
  previewCredit,
  validateManualDepositAmount,
  type ManualDepositConfig,
} from "@/lib/deposits/manualDeposit";
import { formatAmount } from "@/lib/currencies";
import type { KycStatus } from "@/lib/types/database";

/**
 * Naira deposits by bank transfer, in three steps.
 *
 * WHAT THIS IS, IN THE CUSTOMER'S TERMS: they transfer money from their own
 * bank to justpae's account, putting a reference in the narration, and tell us
 * when they have. A person checks the statement and credits the wallet.
 *
 * THE COPY NEVER NAMES A PROVIDER and never says "exchange". There is no
 * provider on this rail — it is a bank transfer to a company account — and the
 * rule holds across the product anyway (see src/lib/email.ts).
 *
 * THE REFERENCE IS THE WHOLE MECHANISM, which is why it is the largest thing
 * on step 2. It is the only string tying a line on a bank statement back to
 * this request; a transfer sent without it is a payment nobody can match, and
 * the customer finds that out days later. Every other field on that screen is
 * a copy button for the same reason — an account number retyped by hand is the
 * other way money goes somewhere it cannot be recovered from.
 */

export function ManualNgnDeposit({
  userId,
  kycStatus,
  config,
  picker,
}: {
  userId: string;
  kycStatus: KycStatus;
  /** Read server-side in the page and passed down, so the screen cannot be
   *  made to show an account number the server did not choose. */
  config: ManualDepositConfig;
  /**
   * The shared "Deposit into" select, rendered above every state here.
   * Passed in rather than rebuilt so there is one picker in the product and
   * not two that can drift — and it stays on the gate screens too, because a
   * customer who cannot deposit naira may still be able to deposit something
   * else and should not have to go back to find out.
   */
  picker?: React.ReactNode;
}) {
  const router = useRouter();

  const shell = (children: React.ReactNode) => (
    <div className="space-y-4">
      {picker}
      {children}
    </div>
  );
  const [amountText, setAmountText] = useState("");
  const [startState, startAction] = useActionState(startManualDeposit, {});

  // ── The KYC gate ────────────────────────────────────────────────────────
  //
  // Mirrored inside create_manual_deposit, which is the enforcement. This is
  // here so somebody who is not verified gets a screen and a way forward
  // rather than an exception. The wording follows WithdrawForm's gate: it
  // names the stage the person is actually at, because "Start verification"
  // pointing at the account-type question is a dead end for someone who
  // answered it last week and only needs to send a photo.
  if (kycStatus !== "approved") {
    if (kycStatus === "pending") {
      return shell(
        <Banner
          tone="info"
          title="We're reviewing your details"
          action={{ href: "/onboarding/kyc/status", label: "View status" }}
        >
          Naira deposits open up as soon as you&apos;re verified. Everything else on your
          account carries on as normal in the meantime.
        </Banner>,
      );
    }

    return shell(
      <Banner
        tone={kycStatus === "rejected" ? "danger" : "warning"}
        title={
          kycStatus === "rejected"
            ? "We couldn't verify your details"
            : "Verify your identity to deposit naira"
        }
        action={{
          href: kycStatus === "rejected" ? "/onboarding/kyc/status" : "/onboarding/kyc",
          label: kycStatus === "rejected" ? "Resubmit" : "Verify your identity",
        }}
      >
        {kycStatus === "rejected"
          ? "Please review your documents and submit them again before depositing naira."
          : "We need to confirm who you are before we can take a bank transfer. It takes a couple of minutes."}
      </Banner>,
    );
  }

  // ── Not set up yet ──────────────────────────────────────────────────────
  //
  // 0037 seeds the account EMPTY rather than with a placeholder, so this is a
  // real state on a fresh project and not a defensive branch. Showing a
  // plausible-looking fake account number would be the one failure here with
  // no recovery.
  if (!isManualDepositConfigured(config)) {
    return shell(
      <Banner
        tone="info"
        title="Naira deposits are being set up"
        action={{ href: "/home", label: "Back to home" }}
      >
        We&apos;re not able to take naira transfers just yet. Your naira wallet still converts
        and withdraws in the meantime.
      </Banner>,
    );
  }

  // ── Step 2 and 3 ────────────────────────────────────────────────────────
  if (startState.depositId && startState.reference) {
    return (
      <ManualDepositInstructions
        userId={userId}
        depositId={startState.depositId}
        reference={startState.reference}
        amount={Number(startState.amount ?? 0)}
        config={config}
        onDone={() => {
          router.refresh();
          router.push("/transactions");
        }}
      />
    );
  }

  // ── Step 1 ──────────────────────────────────────────────────────────────
  const amount = parseAmount(amountText);
  const amountError =
    amount > 0
      ? validateManualDepositAmount(amount, config, (value) => formatAmount("NGN", value))
      : null;

  const summary = (
    <WhatHappensNext
      steps={[
        "You tell us how much you're sending, and we give you a reference.",
        "You transfer that amount to our account from your own bank, putting the reference in the narration.",
        "You tell us you've sent it. We check it against our statement and credit your wallet — usually within a few hours on a working day.",
      ]}
      footnote="Nothing leaves your bank until you make the transfer yourself. We never debit you."
    />
  );

  return (
    <MoneyFormLayout summary={summary}>
      <div className="space-y-4">
        {picker}
        <StepIndicator step={1} total={3} />

        <form action={startAction} className="space-y-4">
          <Card className="space-y-3">
            <AmountInput
              name="amount"
              label="How much are you sending?"
              currency="NGN"
              value={amountText}
              onValueChange={setAmountText}
            />
            <p className="text-xs text-muted-foreground">
              Between {formatAmount("NGN", config.minAmount)} and{" "}
              {formatAmount("NGN", config.maxAmount)} in one transfer.
            </p>
          </Card>

          {/* The fee, before the money moves rather than after. A flat charge
              discovered on the receipt is how a support ticket gets written —
              the same reasoning the provider-rail quote step follows. */}
          {config.fee > 0 && amount > 0 && !amountError && (
            <Card>
              <DetailRow label="You transfer">{formatAmount("NGN", amount)}</DetailRow>
              <DetailRow label="Deposit fee">−{formatAmount("NGN", config.fee)}</DetailRow>
              <DetailRow label="Lands in your wallet">
                <strong>{formatAmount("NGN", previewCredit(amount, config.fee))}</strong>
              </DetailRow>
            </Card>
          )}

          {amountError && (
            <Banner tone="info" title="Check that amount">
              {amountError}
            </Banner>
          )}

          {startState.error && (
            <Banner tone="danger" title="Couldn't start that deposit">
              {startState.error}
            </Banner>
          )}

          <SubmitButton disabled={amount <= 0 || amountError != null} pendingLabel="Getting your reference…">
            Continue
          </SubmitButton>

          <LegalReminder />
        </form>
      </div>
    </MoneyFormLayout>
  );
}

function ManualDepositInstructions({
  userId,
  depositId,
  reference,
  amount,
  config,
  onDone,
}: {
  userId: string;
  depositId: string;
  reference: string;
  amount: number;
  config: ManualDepositConfig;
  onDone: () => void;
}) {
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [sentState, sentAction] = useActionState(markManualDepositSent, {});

  if (sentState.ok) {
    return (
      <div className="space-y-4">
        <StepIndicator step={3} total={3} />
        <Banner tone="success" title="Thanks — we're checking it now">
          We&apos;ll match your transfer against our statement and credit your naira wallet.
          You&apos;ll get a message the moment it lands. You can close this page.
        </Banner>
        <Card>
          <DetailRow label="Reference" mono>
            {reference}
          </DetailRow>
          <DetailRow label="Amount you told us">{formatAmount("NGN", amount)}</DetailRow>
        </Card>
        <Button onClick={onDone}>See it in your activity</Button>
      </div>
    );
  }

  const summary = (
    <WhatHappensNext
      steps={[
        "Make the transfer from your own bank app, for exactly the amount shown.",
        "Put the reference in the narration — it's the only thing that ties your transfer to this request.",
        "Come back and tap “I've sent it”. A screenshot helps but isn't required.",
      ]}
      footnote="This request is open for 24 hours. After that the reference stops being valid and you'd start a new one."
    />
  );

  return (
    <MoneyFormLayout summary={summary}>
      <div className="space-y-4">
        <StepIndicator step={2} total={3} />

        <Banner tone="info" title="Transfer from your own bank">
          Send exactly {formatAmount("NGN", amount)} to the account below, and put the
          reference in the narration.
        </Banner>

        {/* THE REFERENCE FIRST AND LARGEST. It is the only thing that can
            match a bank statement line to this request, and a transfer sent
            without it is money nobody can place. */}
        <Card className="space-y-3">
          <CopyField label="Put this in your transfer narration" value={reference} emphasis />
          <CopyField label="Bank" value={config.bankName} />
          <CopyField label="Account number" value={config.accountNumber} />
          <CopyField label="Account name" value={config.accountName} />
          <CopyField label="Amount to send" value={String(amount)} />
        </Card>

        {config.fee > 0 && (
          <Card>
            <DetailRow label="You transfer">{formatAmount("NGN", amount)}</DetailRow>
            <DetailRow label="Deposit fee">−{formatAmount("NGN", config.fee)}</DetailRow>
            <DetailRow label="Lands in your wallet">
              <strong>{formatAmount("NGN", previewCredit(amount, config.fee))}</strong>
            </DetailRow>
          </Card>
        )}

        <form action={sentAction} className="space-y-4">
          <input type="hidden" name="depositId" value={depositId} />
          {/* The path only; the bytes went straight to private storage from
              the browser. Re-verified server-side as the uploader's own —
              see verifyOwnedUpload. */}
          <input type="hidden" name="screenshotPath" value={screenshotPath ?? ""} />

          <Card>
            <UploadField
              name="screenshotFile"
              label="Screenshot of the transfer"
              hint="Optional — it speeds up the check"
              // No `capture`: forcing the camera hides Photo Library and
              // Choose File, and a transfer receipt is a screenshot people
              // already have rather than something to photograph. Same fix as
              // the KYC fields.
              accept="image/*,application/pdf"
              bucket={DEPOSIT_PROOF_BUCKET}
              userId={userId}
              prefix="transfer-proof"
              onUploadedChange={setScreenshotPath}
            />
          </Card>

          {sentState.error && (
            <Banner tone="danger" title="Couldn't record that">
              {sentState.error}
            </Banner>
          )}

          <SubmitButton pendingLabel="Telling us…">I&apos;ve sent it</SubmitButton>

          <p className="text-center text-xs text-muted-foreground">
            Only tap this once the transfer has actually left your bank.
          </p>

          <LegalReminder />
        </form>
      </div>
    </MoneyFormLayout>
  );
}

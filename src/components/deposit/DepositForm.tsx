"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput, parseAmount } from "@/components/ui/AmountInput";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Banner, Card, DetailRow } from "@/components/ui/Primitives";
import { CopyField } from "@/components/ui/CopyButton";
import { SelectField } from "@/components/ui/Field";
import { getDepositQuote, initiateDeposit, checkDepositStatus } from "@/lib/actions/deposits";
import type { DepositAvailability } from "@/lib/deposits/availability";
import { currencyMeta, formatAmount } from "@/lib/currencies";
import type { Currency, Wallet } from "@/lib/types/database";

/**
 * Deposit.
 *
 * Two steps, deliberately: price it, then commit. The quote step is where the
 * provider's fee becomes visible, and the fee is real — a 2,000 naira deposit
 * credits 1,900 after a 100 naira charge. Hiding that until after the money is
 * sent is how a support ticket gets written.
 *
 * Once instructions exist, the screen polls its own status and self-heals. It
 * does not wait for a webhook: for this account the provider's webhook has
 * never delivered, and a platform cron does not run without an external
 * scheduler. A user watching this screen gets credited within one poll cycle
 * regardless.
 */
export function DepositForm({
  wallets,
  availability,
}: {
  wallets: Wallet[];
  availability: Record<string, DepositAvailability>;
}) {
  const router = useRouter();

  const depositable = wallets.filter((w) => availability[w.currency]?.available);
  const [currency, setCurrency] = useState<Currency>(
    depositable[0]?.currency ?? wallets[0]?.currency ?? "NGN",
  );
  const [amountText, setAmountText] = useState("");

  const [quoteState, quoteAction] = useActionState(getDepositQuote, {});
  const [depositState, depositAction] = useActionState(initiateDeposit, {});

  const current = availability[currency];
  const amount = parseAmount(amountText);

  useEffect(() => {
    if (depositState.redirectUrl) {
      // The secondary provider's GHS path hands back a hosted payment page.
      window.location.href = depositState.redirectUrl;
    }
  }, [depositState.redirectUrl]);

  const instructions = depositState.bankDetails ?? depositState.cryptoAddress;

  if (instructions && depositState.depositId) {
    return (
      <DepositInstructions
        depositId={depositState.depositId}
        currency={currency}
        bankDetails={depositState.bankDetails}
        cryptoAddress={depositState.cryptoAddress}
        onDone={() => router.push("/home")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <SelectField
          label="Deposit into"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
        >
          {wallets.map((wallet) => {
            const info = availability[wallet.currency];
            return (
              <option key={wallet.currency} value={wallet.currency} disabled={!info?.available}>
                {currencyMeta(wallet.currency).flag} {wallet.currency}
                {info?.available ? "" : " · unavailable"}
              </option>
            );
          })}
        </SelectField>

        {current && !current.available && (
          <Banner tone="info" title={`${currency} deposits aren't available yet`}>
            {current.reason}
          </Banner>
        )}
      </Card>

      {current?.available && (
        <form action={quoteAction} className="space-y-4">
          <input type="hidden" name="currency" value={currency} />

          <Card>
            <AmountInput
              name="amount"
              label="How much are you sending?"
              currency={currency}
              value={amountText}
              onValueChange={setAmountText}
            />
          </Card>

          {quoteState.error && (
            <Banner tone="danger" title="Couldn't price that">
              {quoteState.error}
            </Banner>
          )}

          <SubmitButton disabled={amount <= 0} pendingLabel="Checking…">
            Continue
          </SubmitButton>
        </form>
      )}

      {quoteState.quoteId && (
        <form action={depositAction} className="space-y-4">
          <input type="hidden" name="currency" value={quoteState.currency ?? currency} />
          <input type="hidden" name="quoteId" value={quoteState.quoteId} />
          <input type="hidden" name="amount" value={quoteState.amount ?? ""} />

          <Card>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Review
            </h2>
            <DetailRow label="You send">
              {formatAmount(currency, Number(quoteState.amount ?? 0))}
            </DetailRow>
            <DetailRow label="Provider fee">
              {formatAmount(currency, Number(quoteState.fee ?? 0))}
            </DetailRow>
            <DetailRow label="Lands in your wallet">
              <strong>{formatAmount(currency, Number(quoteState.netAmount ?? 0))}</strong>
            </DetailRow>
          </Card>

          {depositState.error && (
            <Banner tone="danger" title="Couldn't start that deposit">
              {depositState.error}
            </Banner>
          )}

          <SubmitButton pendingLabel="Getting your details…">Get payment details</SubmitButton>
        </form>
      )}
    </div>
  );
}

function DepositInstructions({
  depositId,
  currency,
  bankDetails,
  cryptoAddress,
  onDone,
}: {
  depositId: string;
  currency: Currency;
  bankDetails?: { accountName: string; accountNumber: string; bankName: string; expiresAt: string };
  cryptoAddress?: { address: string; network: string; expiresAt: string };
  onDone: () => void;
}) {
  const [status, setStatus] = useState<"pending" | "processing" | "completed" | "failed">("pending");

  useEffect(() => {
    if (status === "completed" || status === "failed") return;

    // Every poll re-checks the provider server-side and credits immediately if
    // funds have landed. Eight seconds is frequent enough to feel live without
    // hammering the provider for a transfer that may take minutes.
    const interval = setInterval(async () => {
      const result = await checkDepositStatus(depositId);
      if (result.status) setStatus(result.status);
      if (result.status === "completed") toast.success("Deposit received");
      if (result.status === "failed") toast.error("That deposit didn't go through");
    }, 8000);

    return () => clearInterval(interval);
  }, [depositId, status]);

  return (
    <div className="space-y-4">
      {status === "completed" ? (
        <Banner tone="success" title="Money received">
          Your {currency} wallet has been credited.
        </Banner>
      ) : status === "failed" ? (
        <Banner tone="danger" title="That deposit didn't go through">
          Nothing was taken. You can start again.
        </Banner>
      ) : (
        <Banner tone="info" title="Waiting for your transfer">
          Send the exact amount to the details below. This page updates itself the moment the
          money arrives — you can leave it open.
        </Banner>
      )}

      {cryptoAddress && (
        <div className="space-y-2">
          <CopyField label={`${currency} address`} value={cryptoAddress.address} />
          <Banner tone="warning" title={`Send on ${cryptoAddress.network} only`}>
            Funds sent on any other network can&apos;t be recovered.
          </Banner>
        </div>
      )}

      {bankDetails && (
        <Card>
          <DetailRow label="Bank">{bankDetails.bankName}</DetailRow>
          <DetailRow label="Account name">{bankDetails.accountName}</DetailRow>
          <DetailRow label="Account number" mono>
            {bankDetails.accountNumber}
          </DetailRow>
          <div className="pt-3">
            <CopyField label="Account number" value={bankDetails.accountNumber} />
          </div>
        </Card>
      )}

      {(bankDetails?.expiresAt || cryptoAddress?.expiresAt) && (
        <p className="text-center text-xs text-muted-foreground">
          These details expire{" "}
          {new Date(bankDetails?.expiresAt ?? cryptoAddress!.expiresAt).toLocaleString("en-GB")}
        </p>
      )}

      <Button variant="secondary" fullWidth onClick={onDone}>
        {status === "completed" ? "Back to home" : "I'll finish this later"}
      </Button>
    </div>
  );
}

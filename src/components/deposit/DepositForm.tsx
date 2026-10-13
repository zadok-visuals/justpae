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
import { fiatMinimumDeposit } from "@/lib/busha/limits";
import { usePolling, isFinalStatus } from "@/lib/hooks/usePolling";
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

  // Mirrored server-side in getDepositQuote AND initiateDeposit, so this is
  // only here to say so before the round trip — it is not the enforcement.
  const minimum = fiatMinimumDeposit(currency);
  const belowMinimum = minimum != null && amount > 0 && amount < minimum;

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
        // router.refresh() on the way out too, not just on the completion
        // poll: the user may close this screen while the deposit is still
        // pending and have it credited by the webhook or the cron a moment
        // later, and /home would otherwise still be showing the balance from
        // whenever it was first rendered.
        // The quote survives into this screen in this component's own state —
        // nothing clears it — so the fee breakdown can be shown here too. It
        // previously appeared only at the review step and then vanished at
        // exactly the moment the user was about to send real money, which is
        // the moment they most need to see what will actually land.
        grossAmount={quoteState.grossAmount}
        fee={quoteState.fee}
        netAmount={quoteState.netAmount}
        onDone={() => {
          router.refresh();
          router.push("/home");
        }}
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

          {belowMinimum && (
            <Banner tone="info" title={`Minimum ${currency} deposit`}>
              The smallest {currency} deposit we can process is{" "}
              {formatAmount(currency, minimum!)}. Anything less is rejected by the time it
              reaches us.
            </Banner>
          )}

          {quoteState.error && (
            <Banner tone="danger" title="Couldn't price that">
              {quoteState.error}
            </Banner>
          )}

          <SubmitButton disabled={amount <= 0 || belowMinimum} pendingLabel="Checking…">
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
            {/* The provider's own quoted source_amount, NOT the typed amount.
                For a percentage-fee currency the two differ — the provider
                grosses the transfer up to cover its fee — and showing the
                typed figure here is what made these three numbers fail to add
                up. See quoteForDesiredNetDeposit in actions/deposits.ts. */}
            <DetailRow label="You transfer">
              {formatAmount(currency, Number(quoteState.grossAmount ?? quoteState.amount ?? 0))}
            </DetailRow>
            <DetailRow label="Deposit fee">
              −{formatAmount(currency, Number(quoteState.fee ?? 0))}
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
  grossAmount,
  fee,
  netAmount,
  onDone,
}: {
  depositId: string;
  currency: Currency;
  bankDetails?: { accountName: string; accountNumber: string; bankName: string; expiresAt: string };
  cryptoAddress?: { address: string; network: string; expiresAt: string };
  grossAmount?: string;
  fee?: string;
  netAmount?: string;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<"pending" | "processing" | "completed" | "failed">("pending");
  const router = useRouter();

  // Every poll re-checks the provider server-side and credits immediately if
  // funds have landed. Shared with the withdrawal and conversion detail views
  // through usePolling, so all three stop on a final status by the same rule
  // rather than three hand-rolled intervals each remembering to.
  usePolling(
    async () => {
      const result = await checkDepositStatus(depositId);
      if (result.status) setStatus(result.status);
      if (result.status === "completed") {
        toast.success("Deposit received");
        // THE STALE BALANCE FIX. checkDepositStatus calls revalidatePath on the
        // server, but that only marks the cached data stale — it does not make
        // an already-mounted client tree re-fetch. And a Server Action invoked
        // as a plain function from an interval callback, rather than dispatched
        // through a form or a transition, carries no router update of its own
        // either. So /home kept rendering the balances from the payload it was
        // first given, and the user saw their old balance after being told the
        // money had arrived.
        router.refresh();
      }
      if (result.status === "failed") toast.error("That deposit didn't go through");
    },
    { active: !isFinalStatus(status) },
  );

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
          Send the exact amount shown below. This page updates itself the moment the money
          arrives — you can leave it open.
        </Banner>
      )}

      {/* The breakdown, repeated HERE. This is the screen the user is looking
          at while they actually make the transfer, and the amount they must
          send is the provider's grossed-up figure, not what they typed. Showing
          it only at the review step and then hiding it is how a transfer goes
          out for the wrong amount. */}
      {grossAmount && status !== "completed" && status !== "failed" && (
        <Card>
          <div className="pb-3">
            <CopyField
              label={`Send exactly this ${currency} amount`}
              value={Number(grossAmount).toFixed(2)}
            />
          </div>
          <DetailRow label="Deposit fee">−{formatAmount(currency, Number(fee ?? 0))}</DetailRow>
          <DetailRow label="You will receive">
            <strong>{formatAmount(currency, Number(netAmount ?? 0))}</strong>
          </DetailRow>
        </Card>
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

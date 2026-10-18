"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput, parseAmount } from "@/components/ui/AmountInput";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Banner, Card, DetailRow } from "@/components/ui/Primitives";
import { CopyField } from "@/components/ui/CopyButton";
import { SelectField } from "@/components/ui/Field";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { getDepositQuote, initiateDeposit, checkDepositStatus } from "@/lib/actions/deposits";
import type { DepositAvailability } from "@/lib/deposits/availability";
import { fiatMinimumDeposit } from "@/lib/busha/limits";
import { usePolling, isFinalStatus } from "@/lib/hooks/usePolling";
import { useCountdown, formatCountdown } from "@/lib/hooks/useCountdown";
import { currencyMeta, formatAmount } from "@/lib/currencies";
import type { Currency, Wallet } from "@/lib/types/database";

/**
 * Deposit, in three named steps.
 *
 * THE STEPS ARE LABELLED because the middle one is where money becomes
 * irreversible and the screen used to pass through it without saying so. The
 * quote step is where the provider's fee becomes visible, and the fee is real
 * — a 2,000 naira deposit credits 1,900 after a 100 naira charge. Hiding that
 * until after the money is sent is how a support ticket gets written.
 *
 *   1. How much      amount, with the minimum enforced before any round trip
 *   2. Check it      what you transfer, the fee, what lands
 *   3. Send it       the generated account or address, the exact amount, the
 *                    expiry clock, and the status polling itself
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
  initialCurrency,
}: {
  wallets: Wallet[];
  availability: Record<string, DepositAvailability>;
  /**
   * From `?currency=` — see src/lib/accounts/preselect.ts. Already validated
   * and already fallen back, so this component takes it at face value.
   */
  initialCurrency?: Currency;
}) {
  const router = useRouter();

  const depositable = wallets.filter((w) => availability[w.currency]?.available);
  const [currency, setCurrency] = useState<Currency>(
    initialCurrency ?? depositable[0]?.currency ?? wallets[0]?.currency ?? "NGN",
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
      <StepIndicator step={quoteState.quoteId ? 2 : 1} total={3} />

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

          {/* "Generate", not "get": the next screen's account number does not
              already exist and is not the user's own. It is created for this
              one transfer, and naming the action that way is the first place
              the user is told so. */}
          <SubmitButton pendingLabel="Generating…">Generate account details</SubmitButton>
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

  // THE COUNTDOWN, and the bug it is written around.
  //
  // useCountdown returns 0 for a missing deadline, exactly as it does for a
  // passed one. Rendering "expired" off that number alone is how the
  // reference implementation ended up telling every user their details had
  // expired the instant they appeared — the provider simply had not sent an
  // expires_at, and absent read as elapsed. So the two cases are separated
  // here: `expiresAt` being present is what makes a clock meaningful at all,
  // and only then does reaching zero mean anything.
  const expiresAt = bankDetails?.expiresAt || cryptoAddress?.expiresAt || "";
  const hasExpiry = expiresAt !== "" && !Number.isNaN(new Date(expiresAt).getTime());
  const secondsLeft = useCountdown(hasExpiry ? expiresAt : undefined);
  const expired = hasExpiry && secondsLeft === 0;
  const settled = status === "completed" || status === "failed";

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
      <StepIndicator step={3} total={3} />

      {status === "completed" ? (
        <Banner tone="success" title="Money received">
          Your {currency} wallet has been credited.
        </Banner>
      ) : status === "failed" ? (
        <Banner tone="danger" title="That deposit didn't go through">
          Nothing was taken. You can start again.
        </Banner>
      ) : expired ? (
        // Expiry is not a failure and must not read as one. Nothing has been
        // taken, nothing is owed — the window simply closed, and the only
        // thing the user has to do is ask for fresh details.
        <Banner tone="warning" title="These details have expired">
          Don&apos;t send anything to them now. Start again and we&apos;ll generate a new
          account for you.
        </Banner>
      ) : (
        <Banner tone="info" title="Waiting for your transfer">
          Send the exact amount shown below. This page updates itself the moment the money
          arrives — you can leave it open.
        </Banner>
      )}

      {/* THE SINGLE MOST EXPENSIVE DEPOSIT MISTAKE is treating these details
          as a standing account and sending to them again next week. They are
          generated per transfer and they die. Said here, in the open, rather
          than as a footnote under the account number. */}
      {!settled && (
        <Banner tone="warning" title="For this one transfer only">
          {cryptoAddress
            ? "This address was created for this deposit and expires. Don't save it or reuse it for a future deposit — generate fresh details each time."
            : "This account was created for this deposit and expires. Don't save it as a beneficiary or send to it again — generate fresh details each time."}
        </Banner>
      )}

      {/* The breakdown, repeated HERE. This is the screen the user is looking
          at while they actually make the transfer, and the amount they must
          send is the provider's grossed-up figure, not what they typed. Showing
          it only at the review step and then hiding it is how a transfer goes
          out for the wrong amount. */}
      {grossAmount && !settled && (
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

      {hasExpiry && !settled && (
        <Card className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {expired ? "Details expired" : "Details expire in"}
          </span>
          <span
            // Announced politely so a screen-reader user hears the expiry
            // once rather than every tick of the clock.
            aria-live={expired ? "polite" : "off"}
            className={`font-mono text-sm font-medium tabular-nums ${
              expired
                ? "text-destructive"
                : secondsLeft <= 60
                  ? "text-primary"
                  : "text-foreground"
            }`}
          >
            {expired ? "—" : formatCountdown(secondsLeft)}
          </span>
        </Card>
      )}

      {hasExpiry && !settled && (
        <p className="text-center text-xs text-muted-foreground">
          Expires {new Date(expiresAt).toLocaleString("en-GB")}
        </p>
      )}

      <Button variant={expired && !settled ? "primary" : "secondary"} fullWidth onClick={onDone}>
        {status === "completed"
          ? "Back to home"
          : expired
            ? "Start again"
            : "I'll finish this later"}
      </Button>
    </div>
  );
}

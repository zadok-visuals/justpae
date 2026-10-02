"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput, formatAmountInput, parseAmount } from "@/components/ui/AmountInput";
import { PinField } from "@/components/ui/PinField";
import { SubmitButton } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { Banner, Card, DetailRow } from "@/components/ui/Primitives";
import { requestWithdrawal, previewWithdrawalRouting } from "@/lib/actions/withdrawals";
import { MINIMUM_WITHDRAWAL_USDT_THRESHOLD } from "@/lib/busha/limits";
import { currencyMeta, formatAmount } from "@/lib/currencies";
import type { Currency, Wallet, WithdrawalRecipient } from "@/lib/types/database";

/**
 * Withdraw.
 *
 * THE THING THIS SCREEN EXISTS TO DO, beyond taking an amount: tell the user
 * BEFORE they confirm whether the money goes out instantly or waits for a
 * human. "Your withdrawal is pending" with no indication of whether that means
 * thirty seconds or tomorrow morning is the single most common support contact
 * in a payout flow, and it is entirely avoidable — the server already knows.
 *
 * The preview calls the same evaluator the payout path uses, so it cannot
 * promise instant and then queue it.
 */
interface WithdrawFormProps {
  wallets: Wallet[];
  recipients: WithdrawalRecipient[];
  hasPin: boolean;
  kycApproved: boolean;
}

/**
 * Owns the action and its success side effects. The stateful form is a child
 * KEYED on the transaction id, so a submitted withdrawal remounts it with an
 * empty amount and an empty PIN — resetting from inside the effect would be a
 * synchronous state write in the effect body, and leaving a PIN sitting in a
 * submitted form is the last thing this screen should do.
 */
export function WithdrawForm(props: WithdrawFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(requestWithdrawal, {});

  useEffect(() => {
    if (!state.transactionId) return;
    toast.success(state.automated ? "Withdrawal sent" : "Withdrawal submitted for review");
    router.refresh();
  }, [state.transactionId, state.automated, router]);

  return (
    <WithdrawFormFields
      key={state.transactionId ?? "new"}
      {...props}
      state={state}
      formAction={formAction}
    />
  );
}

function WithdrawFormFields({
  wallets,
  recipients,
  hasPin,
  kycApproved,
  state,
  formAction,
}: WithdrawFormProps & {
  state: Awaited<ReturnType<typeof requestWithdrawal>>;
  formAction: (formData: FormData) => void;
}) {
  // Withdrawable currencies are the ones with a saved recipient. Offering a
  // currency with no payout destination just moves the failure to submit.
  const withdrawable = wallets.filter((w) =>
    recipients.some((r) => r.currency === w.currency),
  );

  const [currency, setCurrency] = useState<Currency>(
    withdrawable[0]?.currency ?? wallets[0]?.currency ?? "NGN",
  );
  const [amountText, setAmountText] = useState("");
  const [pin, setPin] = useState("");

  const [routing, setRouting] = useState<{
    automated: boolean;
    reason: string | null;
    thresholdUsd: number;
    windowHours: number;
  } | null>(null);
  const [, startPreview] = useTransition();

  const wallet = wallets.find((w) => w.currency === currency);
  const balance = wallet?.balance ?? 0;
  const amount = parseAmount(amountText);
  const recipient = recipients.find((r) => r.currency === currency);

  const insufficient = amount > balance;

  // Debounced: each preview costs a live rate probe plus a rolling-window
  // query, so one request after typing stops rather than one per keystroke.
  const latest = useRef(0);
  useEffect(() => {
    // Returns without touching state when there is nothing to preview. The
    // displayed routing is DERIVED below instead of being cleared here.
    if (amount <= 0 || insufficient) return;

    const requestId = ++latest.current;
    const timer = setTimeout(() => {
      startPreview(async () => {
        const result = await previewWithdrawalRouting(currency, amount);
        if (requestId !== latest.current) return;
        setRouting(result);
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [currency, amount, insufficient]);

  if (!kycApproved) {
    return (
      <Banner
        tone="warning"
        title="Verify your identity to withdraw"
        action={{ href: "/onboarding/kyc", label: "Start verification" }}
      >
        We need to confirm who you are before money can leave your account. It takes a couple of
        minutes.
      </Banner>
    );
  }

  if (withdrawable.length === 0) {
    return (
      <Banner
        tone="info"
        title="Add a payout destination first"
        action={{ href: "/profile", label: "Add a payout account" }}
      >
        Tell us where to send your money — a bank account, an M-Pesa number, or a USDT wallet
        address.
      </Banner>
    );
  }

  // A stale routing verdict must not linger once the amount is cleared.
  const activeRouting = amount > 0 && !insufficient ? routing : null;

  const blocked = !hasPin || amount <= 0 || insufficient || pin.length < 4;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="currency" value={currency} />

      {!hasPin && (
        <Banner
          tone="warning"
          title="Set a transaction PIN first"
          action={{ href: "/profile", label: "Set up your PIN" }}
        >
          Every withdrawal is confirmed with a 4-6 digit PIN.
        </Banner>
      )}

      <Card className="space-y-3">
        <SelectField
          label="Withdraw from"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
        >
          {withdrawable.map((w) => (
            <option key={w.currency} value={w.currency}>
              {currencyMeta(w.currency).flag} {w.currency} ·{" "}
              {formatAmount(w.currency, w.balance)}
            </option>
          ))}
        </SelectField>

        <AmountInput
          name="amount"
          label="Amount"
          currency={currency}
          value={amountText}
          onValueChange={setAmountText}
          max={balance}
          onMax={() => setAmountText(formatAmountInput(balance.toFixed(2)))}
          hint={`Balance ${formatAmount(currency, balance)}`}
          error={insufficient ? `That's more than your ${currency} balance.` : null}
        />
      </Card>

      {recipient && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Going to
          </h2>
          <DetailRow label="Name">{recipient.account_holder_name}</DetailRow>
          {recipient.wallet_address ? (
            <DetailRow label={`Wallet (${recipient.network ?? "BSC"})`} mono>
              {recipient.wallet_address}
            </DetailRow>
          ) : (
            <>
              {recipient.bank_name && <DetailRow label="Bank">{recipient.bank_name}</DetailRow>}
              {recipient.bank_account_number && (
                <DetailRow label={currency === "KES" ? "M-Pesa number" : "Account number"} mono>
                  {recipient.bank_account_number}
                </DetailRow>
              )}
            </>
          )}
        </Card>
      )}

      {/* The answer to "when will this arrive", before they commit. */}
      {activeRouting && (
        <Banner
          tone={activeRouting.automated ? "success" : "info"}
          title={
            activeRouting.automated ? "This goes out instantly" : "This one needs a quick review"
          }
        >
          {activeRouting.automated
            ? "We'll send it as soon as you confirm."
            : activeRouting.reason}
        </Banner>
      )}

      {state.error && (
        <Banner tone="danger" title="Couldn't submit that">
          {state.error}
        </Banner>
      )}

      {hasPin && <PinField value={pin} onValueChange={setPin} />}

      <p className="text-center text-xs text-muted-foreground">
        Minimum withdrawal is about {MINIMUM_WITHDRAWAL_USDT_THRESHOLD} USD in {currency}.
      </p>

      <SubmitButton disabled={blocked} pendingLabel="Sending…">
        Withdraw {amount > 0 ? formatAmount(currency, amount) : ""}
      </SubmitButton>
    </form>
  );
}

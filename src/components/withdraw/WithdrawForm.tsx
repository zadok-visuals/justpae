"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput, formatAmountInput, parseAmount } from "@/components/ui/AmountInput";
import { PinField } from "@/components/ui/PinField";
import { SubmitButton } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { Banner, Card, DetailRow } from "@/components/ui/Primitives";
import { ConfirmDialog, useConfirm } from "@/components/ui/ConfirmDialog";
import { requestWithdrawal, previewWithdrawalRouting } from "@/lib/actions/withdrawals";
import { MINIMUM_WITHDRAWAL_USDT_THRESHOLD } from "@/lib/busha/limits";
import { currencyMeta, formatAmount } from "@/lib/currencies";
import { withdrawAvailability } from "@/lib/accounts/actions";
import { unavailableSuffix, type UnavailableKind } from "@/lib/ui/unavailability";
import { LegalReminder } from "@/components/ui/LegalReminder";
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
  /** Drives WHICH stage the gate below points at, not whether it shows. */
  kycStatus: string | null;
  kycType: string | null;
  /** True once stage one (account type + phone) is on file. */
  hasBasics: boolean;
  rejectionReason: string | null;
  /**
   * From `?currency=` — already validated and already fallen back by
   * src/lib/accounts/preselect.ts, so this is taken at face value.
   */
  initialCurrency?: Currency;
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

/**
 * What the user is shown on the confirmation, captured at the moment they ask
 * for it. `fee` and `netAmount` are null when the preview has not landed —
 * which is a reason to say "we'll confirm the fee on the receipt", not a reason
 * to invent one.
 */
interface ConfirmedWithdrawal {
  currency: Currency;
  amount: number;
  fee: number | null;
  netAmount: number | null;
  destination: string;
  automated: boolean;
}

/**
 * GROUP 4f — why one wallet cannot be picked in the withdraw select, or null
 * when it can.
 *
 * Order matters: a standing refusal outranks a missing destination. Telling
 * someone to go and save a yuan payout account would send them to /profile to
 * do something the database will refuse afterwards anyway.
 */
function withdrawOptionKind(
  currency: Currency,
  recipients: WithdrawalRecipient[],
): UnavailableKind | null {
  if (withdrawAvailability(currency).mode === "never") return "unsupported";
  if (!recipients.some((r) => r.currency === currency)) return "setup";
  return null;
}

/** One line naming where the money lands, for the confirmation dialog. */
function describeDestination(
  recipient: WithdrawalRecipient | undefined,
  currency: Currency,
): string {
  if (!recipient) return "Your saved payout destination";
  if (recipient.wallet_address) {
    return `${recipient.account_holder_name} · ${recipient.wallet_address} (${
      recipient.network ?? "BSC"
    })`;
  }
  const where = [recipient.bank_name, recipient.bank_account_number]
    .filter(Boolean)
    .join(" · ");
  const label = currency === "KES" ? "M-Pesa" : "";
  return [recipient.account_holder_name, where || label].filter(Boolean).join(" · ");
}

function WithdrawFormFields({
  wallets,
  recipients,
  hasPin,
  kycApproved,
  kycStatus,
  kycType,
  hasBasics,
  rejectionReason,
  initialCurrency,
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
    initialCurrency ?? withdrawable[0]?.currency ?? wallets[0]?.currency ?? "NGN",
  );
  const [amountText, setAmountText] = useState("");
  const [pin, setPin] = useState("");

  const [routing, setRouting] = useState<Awaited<
    ReturnType<typeof previewWithdrawalRouting>
  > | null>(null);
  const [, startPreview] = useTransition();

  // The confirmation step. Nothing leaves the account until this is answered —
  // before it existed, a withdrawal committed on a single tap with the fee
  // nowhere on screen.
  //
  // The intent is a SNAPSHOT, not a read of live state: the dialog has to show
  // the figures the user is agreeing to, and a debounced preview landing while
  // the dialog is open must not quietly change them underneath.
  const confirm = useConfirm<ConfirmedWithdrawal>();
  const formRef = useRef<HTMLFormElement>(null);
  // Set only by the dialog's confirm, read and cleared by the submit handler.
  // Without it, requestSubmit() would re-enter the handler and re-open the
  // dialog forever.
  const confirmedRef = useRef(false);

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
    // The gate names the stage the user is actually at. "Start verification"
    // pointing at the account-type question is a dead end for someone who
    // answered it last week and only needs to send a photo.
    if (kycStatus === "pending") {
      return (
        <Banner
          tone="info"
          title="We're reviewing your details"
          action={{ href: "/onboarding/kyc/status", label: "View status" }}
        >
          Withdrawals open up as soon as you&apos;re verified. Your deposits and conversions
          carry on as normal in the meantime.
        </Banner>
      );
    }

    const needsBasics = !hasBasics;
    const idFormHref =
      kycType === "business" ? "/onboarding/kyc/business" : "/onboarding/kyc/individual";

    return (
      <Banner
        tone={kycStatus === "rejected" ? "danger" : "warning"}
        title={
          kycStatus === "rejected"
            ? "We couldn't verify your details"
            : "Verify your identity to withdraw"
        }
        action={{
          href: needsBasics ? "/onboarding/kyc" : idFormHref,
          label: kycStatus === "rejected"
            ? "Resubmit"
            : needsBasics
              ? "Continue setting up"
              : "Submit your ID",
        }}
      >
        {kycStatus === "rejected"
          ? (rejectionReason ??
            "Please review your documents and submit them again before withdrawing.")
          : "We need to confirm who you are before money can leave your account. It takes a couple of minutes."}
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

  // The minimum, in the currency the user is holding, from the same 5 USD floor
  // the server compares against. Null until a live rate has been seen — in which
  // case the line below says nothing rather than quoting an invented number.
  const minimumAmount = activeRouting?.minimumAmount ?? null;
  const belowMinimum = activeRouting?.belowMinimum ?? false;

  const blocked =
    !hasPin || amount <= 0 || insufficient || pin.length < 4 || belowMinimum;

  return (
    <>
    <form
      ref={formRef}
      action={formAction}
      // The confirmation sits here rather than on the button's onClick so that
      // Enter in the amount field goes through it too.
      onSubmit={(event) => {
        if (confirmedRef.current) {
          confirmedRef.current = false;
          return;
        }
        event.preventDefault();
        confirm.ask({
          currency,
          amount,
          fee: activeRouting?.fee ?? null,
          netAmount: activeRouting?.netAmount ?? null,
          destination: describeDestination(recipient, currency),
          automated: activeRouting?.automated ?? false,
        });
      }}
      className="space-y-4"
    >
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
          {/* GROUP 4f. Every wallet, not only the withdrawable ones.

              This picker used to list ONLY currencies with a saved payout
              destination, which is the "· unavailable" problem in its most
              extreme form: the option simply was not there. A cedi holder with
              no saved Ghanaian bank account opened /withdraw and saw no GHS at
              all, with no way to tell whether the product refuses cedis, has
              lost their wallet, or is waiting on something they could fix in
              thirty seconds on /profile.

              Two genuinely different states, and neither is "Maintenance":
                Setup        nothing is wrong — the user has not saved a payout
                             destination for that currency yet.
                Unsupported  a standing refusal. CNY is blocked by a database
                             trigger (migration 0026) and USD has no payout
                             rail, and no amount of waiting changes either. */}
          {wallets.map((w) => {
            const kind = withdrawOptionKind(w.currency, recipients);
            return (
              <option key={w.currency} value={w.currency} disabled={kind !== null}>
                {currencyMeta(w.currency).flag} {w.currency} ·{" "}
                {formatAmount(w.currency, w.balance)}
                {kind ? unavailableSuffix(kind) : ""}
              </option>
            );
          })}
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
        <Banner live tone="danger" title="Couldn't submit that">
          {state.error}
        </Banner>
      )}

      {/* The fee and what actually arrives, BEFORE the confirmation — so the
          dialog confirms a figure the user has already seen rather than
          springing it on them. */}
      {activeRouting && (
        <Card>
          <DetailRow label="Fee">{formatAmount(currency, activeRouting.fee)}</DetailRow>
          <DetailRow label="You'll receive">
            {formatAmount(currency, activeRouting.netAmount)}
          </DetailRow>
        </Card>
      )}

      {hasPin && <PinField value={pin} onValueChange={setPin} />}

      <p className="text-center text-xs text-muted-foreground">
        {minimumAmount !== null
          ? `Minimum withdrawal is ${formatAmount(currency, minimumAmount)}.`
          : `Minimum withdrawal is ${MINIMUM_WITHDRAWAL_USDT_THRESHOLD} USD.`}
      </p>

      {belowMinimum && minimumAmount !== null && (
        <Banner live tone="warning" title="That's below the minimum">
          Withdraw at least {formatAmount(currency, minimumAmount)}.
        </Banner>
      )}

      <SubmitButton disabled={blocked} pendingLabel="Sending…">
        Withdraw {amount > 0 ? formatAmount(currency, amount) : ""}
      </SubmitButton>

      {/* GROUP 4g. /withdraw is one screen rather than three, so the amount
          step and the review step are both this form — the fee card above IS
          the review — and one line serves both. The third instance is inside
          the confirmation dialog below, which is the only thing between this
          button and money leaving. */}
      <LegalReminder />
    </form>

    <ConfirmDialog
      open={confirm.open}
      title="Confirm this withdrawal"
      body={
        confirm.intent?.automated
          ? "We'll send this as soon as you confirm."
          : "We'll review this one before it goes out."
      }
      rows={
        confirm.intent
          ? [
              {
                label: "Amount",
                value: formatAmount(confirm.intent.currency, confirm.intent.amount),
              },
              {
                label: "Fee",
                value:
                  confirm.intent.fee === null
                    ? "Confirmed on your receipt"
                    : formatAmount(confirm.intent.currency, confirm.intent.fee),
              },
              {
                label: "You'll receive",
                value:
                  confirm.intent.netAmount === null
                    ? formatAmount(confirm.intent.currency, confirm.intent.amount) +
                      " less the fee"
                    : formatAmount(confirm.intent.currency, confirm.intent.netAmount),
                emphasis: true,
              },
              { label: "Going to", value: confirm.intent.destination },
            ]
          : undefined
      }
      confirmLabel="Withdraw"
      cancelLabel="Go back"
      // GROUP 4g — the confirmation step's own copy of the reminder. The
      // links open in a new tab, so reading the Terms here does not dismiss
      // the dialog or discard the snapshot it is confirming.
      footer={<LegalReminder />}
      onCancel={confirm.cancel}
      onConfirm={() =>
        confirm.confirm(() => {
          confirmedRef.current = true;
          formRef.current?.requestSubmit();
        })
      }
    />
    </>
  );
}

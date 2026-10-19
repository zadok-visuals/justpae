"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput, formatAmountInput, parseAmount } from "@/components/ui/AmountInput";
import { PinField } from "@/components/ui/PinField";
import { SubmitButton } from "@/components/ui/Button";
import { Banner, Card, DetailRow, SectionHeader } from "@/components/ui/Primitives";
import { SelectField, TextField } from "@/components/ui/Field";
import { UploadField } from "@/components/ui/UploadField";
import { ConfirmDialog, useConfirm, type ConfirmRow } from "@/components/ui/ConfirmDialog";
import {
  estimatePayToChina,
  submitPayToChina,
  type PayToChinaEstimate,
} from "@/lib/actions/payToChina";
import { currencyMeta, formatAmount } from "@/lib/currencies";
import type {
  Currency,
  PayoutMethod,
  SavedPayToChinaRecipient,
  Wallet,
} from "@/lib/types/database";
import { MoneyFormLayout, WhatHappensNext } from "@/components/money/MoneyFormLayout";

/**
 * Pay to China.
 *
 * The question the form is organised around is "who is getting paid, and how
 * much do they end up with" — not "how much am I spending". A customer
 * paying a Chinese supplier has an invoice in yuan; the naira figure is a
 * consequence. So the yuan estimate sits directly under the amount, updates
 * as they type, and is the number the confirmation leads with.
 *
 * THE ESTIMATE COMES FROM THE SERVER on every change, debounced. It cannot be
 * computed here: the yuan rate depends on the size of the order (a ladder a
 * customer session deliberately cannot read) and on a live rate for the fiat
 * leg. Showing a client-side approximation would mean showing a number that
 * disagrees with the one on the confirmation.
 *
 * A QR CODE ALONE IS A COMPLETE RECIPIENT. Most people paying in China are
 * sent a screenshot and have no idea what the account behind it is called.
 * Requiring a typed handle as well turns the common case into a dead end —
 * it is the bug the reference implementation shipped and had to patch in SQL.
 */

const METHODS: { value: PayoutMethod; label: string; hint: string }[] = [
  { value: "alipay", label: "Alipay", hint: "Phone number, email, or their QR code" },
  { value: "wechat", label: "WeChat Pay", hint: "Phone number, email, or their QR code" },
  { value: "bank", label: "Chinese bank", hint: "Bank, account number and account name" },
];

interface PayToChinaFormProps {
  wallets: Wallet[];
  savedRecipients: SavedPayToChinaRecipient[];
  hasPin: boolean;
  kycApproved: boolean;
  userId: string;
  /** The wallet the user arrived with, from ?currency= on an account page. */
  initialCurrency?: Currency;
}

export function PayToChinaForm(props: PayToChinaFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(submitPayToChina, {});

  useEffect(() => {
    if (!state.transactionId) return;
    toast.success("Payment request sent");
    router.refresh();
  }, [state.transactionId, router]);

  // Keyed on the transaction id, so a submitted request remounts the form
  // with empty fields and, above all, an empty PIN.
  return (
    <PayToChinaFields
      key={state.transactionId ?? "new"}
      {...props}
      state={state}
      formAction={formAction}
    />
  );
}

function PayToChinaFields({
  wallets,
  savedRecipients,
  hasPin,
  kycApproved,
  userId,
  initialCurrency,
  state,
  formAction,
}: PayToChinaFormProps & {
  state: Awaited<ReturnType<typeof submitPayToChina>>;
  formAction: (formData: FormData) => void;
}) {
  // Only wallets with something in them. Offering an empty wallet as a source
  // is offering a request that is guaranteed to be refused for insufficient
  // balance after the PIN has been typed.
  const funded = useMemo(
    () => wallets.filter((w) => w.balance > 0 && w.currency !== "USD"),
    [wallets],
  );

  const [sourceCurrency, setSourceCurrency] = useState<Currency>(
    // A wallet named in the URL wins, because the user picked it on the
    // account page they came from and being dropped onto a different one is
    // the app overruling a choice already made. Only if it is actually
    // funded — an empty wallet is not in `funded` and selecting it would
    // show a balance of zero and refuse every amount.
    funded.find((w) => w.currency === initialCurrency)?.currency ??
      // Otherwise the CNY wallet when it has anything in it: yuan already
      // bought is yuan that does not need pricing again.
      funded.find((w) => w.currency === "CNY")?.currency ??
      funded[0]?.currency ??
      "NGN",
  );
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState<PayoutMethod>("alipay");
  const [qrPath, setQrPath] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  const [estimate, setEstimate] = useState<PayToChinaEstimate | null>(null);
  const [estimating, startEstimating] = useTransition();

  const confirm = useConfirm<{ sourceAmount: number; cnyAmount: number }>();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);

  const wallet = wallets.find((w) => w.currency === sourceCurrency);
  const balance = wallet?.balance ?? 0;
  const amount = parseAmount(amountText);
  const insufficient = amount > balance;

  // Debounced, because each call costs a live provider lookup for the fiat
  // leg — one request at the end of a six-digit amount rather than six.
  const latestRequest = useRef(0);
  useEffect(() => {
    if (amount <= 0) return;
    const requestId = ++latestRequest.current;
    const timer = setTimeout(() => {
      startEstimating(async () => {
        const result = await estimatePayToChina({ sourceCurrency, amount });
        // An out-of-order response would otherwise overwrite a newer estimate
        // with an older one, showing a figure for an amount no longer typed.
        if (requestId !== latestRequest.current) return;
        setEstimate(result);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [sourceCurrency, amount]);

  const active = amount > 0 ? estimate : null;
  const cnyAmount = active?.cnyAmount ?? null;
  const belowMinimum = active?.belowMinimum ?? false;
  const unavailable = active?.unavailableReason ?? null;

  const blocked =
    !hasPin ||
    !kycApproved ||
    funded.length === 0 ||
    amount <= 0 ||
    insufficient ||
    belowMinimum ||
    cnyAmount == null ||
    unavailable != null ||
    pin.length < 4;

  function applySaved(saved: SavedPayToChinaRecipient | undefined) {
    if (!saved) return;
    setMethod(saved.payout_method);
    // The saved QR travels with the recipient: re-uploading the same
    // screenshot every month is the whole thing saving a recipient avoids.
    setQrPath(saved.qr_code_ref ?? null);
  }

  const selectedSaved = savedRecipients.find((r) => r.payout_method === method);

  if (funded.length === 0) {
    return (
      <Banner tone="info" title="Add money first">
        Pay to China sends from one of your wallets, and they&apos;re all empty right now. Add
        money or convert into yuan, then come back.
      </Banner>
    );
  }

  /**
   * GROUP 6a — the summary column.
   *
   * The yuan figure, which is the only number on this screen the customer
   * actually cares about (the invoice is in yuan; the naira is a
   * consequence), plus the honest account of how this payment is settled.
   *
   * The sticky column earns its place here more than on any other money
   * form: this one is three cards, a QR upload and a PIN, so on a laptop the
   * amount field is off screen by the time the user reaches the submit
   * button and the figure they are committing to had scrolled away with it.
   */
  const amountsCard = (
    <Card>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        This payment
      </h2>
      <DetailRow label="You pay">
        {amount > 0 ? formatAmount(sourceCurrency, amount) : "—"}
      </DetailRow>
      <DetailRow label="They receive">
        {estimating ? (
          <span className="text-muted-foreground">Working it out…</span>
        ) : cnyAmount != null ? (
          <strong>{formatAmount("CNY", cnyAmount)}</strong>
        ) : (
          "—"
        )}
      </DetailRow>
      <DetailRow label="Paid by">
        {METHODS.find((m) => m.value === method)?.label ?? method}
      </DetailRow>
      {sourceCurrency !== "CNY" && cnyAmount != null && (
        <p className="pt-2 text-xs text-muted-foreground">
          The yuan is bought as the payment goes out, so we confirm the exact figure when you
          submit.
        </p>
      )}
    </Card>
  );

  const nextSteps = (
    <WhatHappensNext
      steps={[
        sourceCurrency === "CNY"
          ? "You confirm with your PIN, and the yuan comes off your CNY balance."
          : `You confirm with your PIN. The amount is held off your ${sourceCurrency} balance straight away, and the yuan is bought at the rate you were shown.`,
        "Our team pays your recipient by hand — this one is not automated, and it is not instant.",
        "You get a notification and an email at every step, and the payment's own screen shows where it has got to.",
      ]}
      footnote="If the payment cannot be made, the full amount goes back into the wallet it came from."
    />
  );

  return (
    <MoneyFormLayout
      summary={
        <>
          {amountsCard}
          {nextSteps}
        </>
      }
    >
    <>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={(event) => {
          if (confirmedRef.current) {
            confirmedRef.current = false;
            return;
          }
          event.preventDefault();
          if (cnyAmount == null) return;
          // Snapshots the figures rather than reading them back on confirm:
          // the estimate is debounced, and one landing while the dialog is
          // open would change the numbers the user is in the middle of
          // reading.
          confirm.ask({ sourceAmount: amount, cnyAmount });
        }}
        className="space-y-4"
      >
        <input type="hidden" name="sourceCurrency" value={sourceCurrency} />
        <input type="hidden" name="payoutMethod" value={method} />
        {qrPath && <input type="hidden" name="qrCodePath" value={qrPath} />}

        {!kycApproved && (
          <Banner
            tone="warning"
            title="Verify your identity first"
            action={{ href: "/onboarding/kyc", label: "Start verification" }}
          >
            Money leaving the platform to someone else needs a verified account. It&apos;s the
            same check as a withdrawal.
          </Banner>
        )}

        {!hasPin && (
          <Banner
            tone="warning"
            title="Set a transaction PIN first"
            action={{ href: "/profile", label: "Set up your PIN" }}
          >
            Every payment is confirmed with a 4-6 digit PIN.
          </Banner>
        )}

        {/* ── 1. What you're paying with ─────────────────────────────── */}
        <Card className="space-y-3">
          <SelectField
            label="Pay from"
            value={sourceCurrency}
            onChange={(e) => setSourceCurrency(e.target.value as Currency)}
          >
            {funded.map((w) => (
              <option key={w.currency} value={w.currency}>
                {currencyMeta(w.currency).flag} {w.currency} · {formatAmount(w.currency, w.balance)}
              </option>
            ))}
          </SelectField>

          <AmountInput
            name="amount"
            label="You send"
            currency={sourceCurrency}
            value={amountText}
            onValueChange={setAmountText}
            max={balance}
            onMax={() => setAmountText(formatAmountInput(balance.toFixed(2)))}
            hint={`Balance ${formatAmount(sourceCurrency, balance)}`}
            error={
              insufficient
                ? `That's more than your ${sourceCurrency} balance.`
                : belowMinimum && active?.minimumSourceAmount != null
                  ? // In the currency being spent, from the figure the server
                    // resolved on the same live rate it will gate on.
                    `The smallest payment we can send is ${formatAmount(
                      sourceCurrency,
                      active.minimumSourceAmount,
                    )}.`
                  : null
            }
          />

          {/* The number the customer actually cares about, directly under the
              one they typed. An invoice is in yuan; the naira is a
              consequence.

              GROUP 6a: below 1024px only. At `lg` the same figure is in the
              sticky summary column beside the field, which is visible at the
              same time and does not need repeating here — and a form this
              long (three cards, a QR upload and a PIN) is exactly the case a
              sticky summary exists for. */}
          <div
            aria-live="polite"
            className="rounded-lg border border-border bg-secondary px-3 py-2.5 lg:hidden"
          >
            {estimating ? (
              <p className="text-sm text-muted-foreground">Working out the yuan…</p>
            ) : cnyAmount != null ? (
              <p className="text-sm text-muted-foreground">
                Your recipient gets about{" "}
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {formatAmount("CNY", cnyAmount)}
                </span>
                {sourceCurrency !== "CNY" && " — we confirm the exact figure when you submit."}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Enter an amount to see what your recipient receives.
              </p>
            )}
          </div>

          {unavailable && (
            <Banner live tone="info" title="We can't price that right now">
              {unavailable}
            </Banner>
          )}
        </Card>

        {/* ── 2. How they get paid ───────────────────────────────────── */}
        <Card className="space-y-3">
          <SectionHeader title="How should they be paid?" />
          <div className="grid gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                aria-pressed={method === m.value}
                className={`min-h-16 rounded-xl border px-3 py-2 text-left text-sm font-medium ${
                  method === m.value
                    ? "border-primary bg-secondary text-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                <span className="block">{m.label}</span>
                <span className="block text-xs font-normal text-muted-foreground">{m.hint}</span>
              </button>
            ))}
          </div>

          {selectedSaved && (
            <button
              type="button"
              onClick={() => applySaved(selectedSaved)}
              className="min-h-11 text-left text-sm font-medium text-primary"
            >
              Use saved recipient “{selectedSaved.label}” →
            </button>
          )}

          {method === "bank" ? (
            <div className="space-y-3">
              <TextField
                name="recipientBankName"
                label="Bank"
                placeholder="e.g. Bank of China"
                autoComplete="off"
              />
              <TextField
                name="recipientBankAccountNumber"
                label="Account number"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={selectedSaved?.recipient_bank_account_number ?? ""}
              />
              <TextField
                name="recipientAccountHolderName"
                label="Account holder's name"
                autoComplete="off"
                defaultValue={selectedSaved?.recipient_account_holder_name ?? ""}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  name="recipientFirstName"
                  label="First name"
                  autoComplete="off"
                  defaultValue={selectedSaved?.recipient_first_name ?? ""}
                />
                <TextField
                  name="recipientLastName"
                  label="Last name"
                  autoComplete="off"
                  defaultValue={selectedSaved?.recipient_last_name ?? ""}
                />
              </div>

              <TextField
                name={method === "alipay" ? "recipientAlipayId" : "recipientWechatId"}
                label={`${method === "alipay" ? "Alipay" : "WeChat"} phone number or email`}
                hint="Or skip this and upload their QR code below"
                autoComplete="off"
                defaultValue={
                  (method === "alipay"
                    ? selectedSaved?.recipient_alipay_id
                    : selectedSaved?.recipient_wechat_id) ?? ""
                }
              />

              <UploadField
                name="qrCodeFile"
                label="Their payment QR code"
                hint="A screenshot is fine. This alone is enough — you don't also need their phone number."
                accept="image/jpeg,image/png,image/webp"
                bucket="pay-to-china-qr"
                userId={userId}
                prefix="recipient-qr"
                onUploadedChange={setQrPath}
              />
            </div>
          )}
        </Card>

        {/* ── 3. Save them for next time ─────────────────────────────── */}
        <Card className="space-y-3">
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              name="saveRecipient"
              className="size-5 rounded border-input bg-secondary"
            />
            Save this recipient for next time
          </label>
          <TextField
            name="saveLabel"
            label="Call them"
            hint="Only used if you tick the box above"
            placeholder="e.g. Shenzhen supplier"
            autoComplete="off"
          />
        </Card>

        {hasPin && <PinField value={pin} onValueChange={setPin} error={state.error} />}

        <SubmitButton disabled={blocked} pendingLabel="Sending…">
          {cnyAmount != null ? `Send ${formatAmount("CNY", cnyAmount)}` : "Send to China"}
        </SubmitButton>

        {/* The panel inline on a phone, where there is no second column. */}
        <div className="lg:hidden">{nextSteps}</div>
      </form>

      <ConfirmDialog
        open={confirm.open}
        title="Confirm this payment"
        body="Our team pays these by hand, so it isn't instant. We'll keep you posted at every step."
        rows={confirm.intent ? confirmRows(confirm.intent, sourceCurrency, method) : undefined}
        confirmLabel="Send it"
        cancelLabel="Go back"
        onCancel={confirm.cancel}
        onConfirm={() =>
          confirm.confirm(() => {
            confirmedRef.current = true;
            formRef.current?.requestSubmit();
          })
        }
      />
    </>
    </MoneyFormLayout>
  );
}

function confirmRows(
  intent: { sourceAmount: number; cnyAmount: number },
  sourceCurrency: Currency,
  method: PayoutMethod,
): ConfirmRow[] {
  return [
    { label: "You pay", value: formatAmount(sourceCurrency, intent.sourceAmount) },
    {
      label: "They receive",
      value: formatAmount("CNY", intent.cnyAmount),
      emphasis: true,
    },
    { label: "Paid by", value: METHODS.find((m) => m.value === method)?.label ?? method },
  ];
}

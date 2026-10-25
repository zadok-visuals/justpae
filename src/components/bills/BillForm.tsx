"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmountInput, parseAmount } from "@/components/ui/AmountInput";
import { PinField } from "@/components/ui/PinField";
import { Button, SubmitButton } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Banner, Card, DetailRow } from "@/components/ui/Primitives";
import { CopyField } from "@/components/ui/CopyButton";
import { ConfirmDialog, useConfirm } from "@/components/ui/ConfirmDialog";
import { payBill, validateBillCustomer } from "@/lib/actions/bills";
import { useDebouncedQuote } from "@/lib/hooks/useDebouncedQuote";
import { CurrencyPicker } from "@/components/ui/CurrencyPicker";
import { fundingPickerOptions } from "@/lib/ui/currencyPicker";
import { formatAmount } from "@/lib/currencies";
import type { Biller } from "@/lib/providers/bills";
import type { BillCategory, Currency, Wallet } from "@/lib/types/database";

/**
 * The bill payment flow: biller → identifier → name check → amount → wallet →
 * review → PIN → receipt.
 *
 * The name check is the step that earns its place. A mistyped meter number
 * credits a stranger's meter and there is no recall, so the biller's own name
 * lookup runs before the money moves and the result is shown on the review
 * step. Where a biller has no lookup, the review step says so rather than
 * implying a confirmation that never happened.
 */
export function BillForm({
  category,
  billers,
  wallets,
  hasPin,
  available,
  initialBillerCode,
  initialIdentifier,
}: {
  category: BillCategory;
  billers: Biller[];
  wallets: Wallet[];
  hasPin: boolean;
  available: boolean;
  initialBillerCode?: string;
  initialIdentifier?: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(payBill, {});

  useEffect(() => {
    if (!state.billPaymentId) return;
    toast.success(state.pending ? "Payment submitted" : "Payment complete");
    router.refresh();
  }, [state.billPaymentId, state.pending, router]);

  // A completed payment shows a receipt rather than an empty form: the token
  // on an electricity receipt is the thing the customer actually came for.
  if (state.billPaymentId) {
    return (
      <Receipt
        token={state.token ?? null}
        units={state.units ?? null}
        pending={state.pending ?? false}
        onDone={() => router.push("/bills")}
      />
    );
  }

  return (
    <BillFormFields
      category={category}
      billers={billers}
      wallets={wallets}
      hasPin={hasPin}
      available={available}
      initialBillerCode={initialBillerCode}
      initialIdentifier={initialIdentifier}
      error={state.error}
      formAction={formAction}
    />
  );
}

/**
 * What the user is agreeing to pay, snapshotted when they ask to confirm. The
 * debounced name lookup can land at any moment; the dialog must not change the
 * name under them between reading it and agreeing to it.
 */
interface ConfirmedBill {
  billerName: string;
  identifierLabel: string;
  identifier: string;
  /** Null when this biller has no name lookup, which the dialog says out loud. */
  customerName: string | null;
  currency: Currency;
  amount: number;
}

function BillFormFields({
  category,
  billers,
  wallets,
  hasPin,
  available,
  initialBillerCode,
  initialIdentifier,
  error,
  formAction,
}: {
  category: BillCategory;
  billers: Biller[];
  wallets: Wallet[];
  hasPin: boolean;
  available: boolean;
  initialBillerCode?: string;
  initialIdentifier?: string;
  error?: string;
  formAction: (formData: FormData) => void;
}) {
  const [billerCode, setBillerCode] = useState(
    // A saved beneficiary link preselects both, so a repeat payment is amount
    // plus PIN and nothing else.
    initialBillerCode && billers.some((b) => b.code === initialBillerCode)
      ? initialBillerCode
      : (billers[0]?.code ?? ""),
  );
  const [identifier, setIdentifier] = useState(initialIdentifier ?? "");
  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState<Currency>(wallets[0]?.currency ?? "NGN");
  const [pin, setPin] = useState("");
  const [saveBeneficiary, setSaveBeneficiary] = useState(false);

  const [lookup, setLookup] = useState<{
    customerName?: string | null;
    error?: string;
    unsupported?: boolean;
  } | null>(null);


  // The confirmation. A mistyped meter number credits a stranger's meter and
  // there is no recall, so the name the biller returned — or the explicit fact
  // that nobody could confirm one — is the headline of this dialog.
  const confirm = useConfirm<ConfirmedBill>();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);

  const biller = billers.find((b) => b.code === billerCode) ?? null;
  const amount = parseAmount(amountText);
  const wallet = wallets.find((w) => w.currency === currency);
  const balance = wallet?.balance ?? 0;
  const insufficient = amount > balance;

  // Debounced name lookup: every keystroke of a meter number would otherwise
  // be a biller API call, and the number is only meaningful once it is whole.
  //
  // GROUP 11a: through the shared hook. 600ms, not the 300 the money forms
  // use, and deliberately the longest wait in the app — this is the one input
  // where a partial value is not an approximation of the right answer but a
  // different meter belonging to somebody else.
  useDebouncedQuote({
    key: `${biller?.code ?? ""}|${identifier.trim()}`,
    enabled: !!biller?.supportsNameValidation && identifier.trim().length >= 6,
    // `enabled` is the guard: the thunk is only ever called when a biller that
    // supports a name lookup is selected. TypeScript cannot carry that
    // narrowing across the closure, hence the assertion.
    request: () => validateBillCustomer(biller!.code, identifier.trim()),
    onResult: setLookup,
    debounceMs: 600,
  });

  // Derived rather than cleared from the effect, so an old name can't linger
  // beside a newly edited number.
  const activeLookup = identifier.trim().length >= 6 ? lookup : null;

  const blocked =
    !available || !hasPin || !biller || !identifier.trim() || amount <= 0 || insufficient || pin.length < 4;

  return (
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
        if (!biller) return;
        confirm.ask({
          billerName: biller.name,
          identifierLabel: biller.identifierLabel,
          identifier: identifier.trim(),
          customerName: activeLookup?.customerName ?? null,
          currency,
          amount,
        });
      }}
      className="space-y-4"
    >
      <input type="hidden" name="billerCode" value={billerCode} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="customerName" value={activeLookup?.customerName ?? ""} />
      {saveBeneficiary && <input type="hidden" name="saveBeneficiary" value="on" />}
      {saveBeneficiary && (
        <input
          type="hidden"
          name="beneficiaryLabel"
          value={`${biller?.name ?? ""} — ${identifier.trim()}`}
        />
      )}

      {/* GROUP 4f — the title matches the heading on /bills, which Group 4e
          already changed to "under maintenance". These two sit on the same
          screen and said two different things about one state. */}
      {!available && (
        <Banner tone="info" title="Bill payments are under maintenance">
          You can fill this in to see how it works, but we can&apos;t take the payment yet.
        </Banner>
      )}

      {!hasPin && available && (
        <Banner
          tone="warning"
          title="Set a transaction PIN first"
          action={{ href: "/profile", label: "Set up your PIN" }}
        >
          Every payment is confirmed with a 4-6 digit PIN.
        </Banner>
      )}

      <Card className="space-y-3">
        <SelectField
          label={category === "airtime" || category === "data" ? "Network" : "Biller"}
          value={billerCode}
          onChange={(e) => {
            setBillerCode(e.target.value);
            setLookup(null);
          }}
        >
          {billers.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </SelectField>

        {biller && (
          <TextField
            name="customerIdentifier"
            label={biller.identifierLabel}
            hint={biller.identifierHint}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            // A phone number wants the tel keypad; a meter or smartcard number
            // wants a plain numeric one.
            inputMode={category === "airtime" || category === "data" ? "tel" : "numeric"}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="next"
            placeholder={biller.identifierLabel}
          />
        )}

        {activeLookup?.customerName && (
          <Banner live tone="success" title={activeLookup.customerName}>
            That&apos;s who this payment will credit.
          </Banner>
        )}
        {activeLookup?.error && (
          <Banner live tone="danger" title="We couldn't find that">
            {activeLookup.error}
          </Banner>
        )}
        {activeLookup?.unsupported && biller?.supportsNameValidation && (
          <p className="text-xs text-muted-foreground">
            We can&apos;t confirm the name for this biller — check the number carefully.
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <CurrencyPicker
          label="Pay from"
          title="Pay from"
          value={currency}
          options={fundingPickerOptions(wallets)}
          onChange={setCurrency}
        />

        {biller?.fixedAmounts ? (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-foreground">Amount</legend>
            <div className="flex flex-wrap gap-2">
              {biller.fixedAmounts.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmountText(value.toLocaleString("en-US"))}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${
                    amount === value
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-secondary text-foreground"
                  }`}
                >
                  {formatAmount(currency, value)}
                </button>
              ))}
            </div>
            <input type="hidden" name="amount" value={String(amount)} />
          </fieldset>
        ) : (
          <AmountInput
            name="amount"
            label="Amount"
            currency={currency}
            value={amountText}
            onValueChange={setAmountText}
            max={balance}
            onMax={() => setAmountText(balance.toLocaleString("en-US"))}
            hint={`Balance ${formatAmount(currency, balance)}`}
            error={insufficient ? `That's more than your ${currency} balance.` : null}
          />
        )}
      </Card>

      {biller && amount > 0 && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Review
          </h2>
          <DetailRow label="Biller">{biller.name}</DetailRow>
          <DetailRow label={biller.identifierLabel} mono>
            {identifier.trim() || "—"}
          </DetailRow>
          {activeLookup?.customerName && (
            <DetailRow label="Name">{activeLookup.customerName}</DetailRow>
          )}
          <DetailRow label="Amount">{formatAmount(currency, amount)}</DetailRow>
        </Card>
      )}

      <label className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <input
          type="checkbox"
          checked={saveBeneficiary}
          onChange={(e) => setSaveBeneficiary(e.target.checked)}
          className="size-5 accent-[var(--color-primary)]"
        />
        <span className="text-sm text-foreground">Save this for next time</span>
      </label>

      {error && (
        <Banner live tone="danger" title="Couldn't complete that">
          {error}
        </Banner>
      )}

      {hasPin && <PinField value={pin} onValueChange={setPin} />}

      <SubmitButton disabled={blocked} pendingLabel="Paying…">
        Pay {amount > 0 ? formatAmount(currency, amount) : ""}
      </SubmitButton>
    </form>

    <ConfirmDialog
      open={confirm.open}
      title="Confirm this payment"
      body={
        confirm.intent?.customerName
          ? "Check the name below is who you meant to pay. A bill payment can't be recalled."
          : "We couldn't confirm a name for this one, so check the number carefully — a bill payment can't be recalled."
      }
      rows={
        confirm.intent
          ? [
              { label: "Biller", value: confirm.intent.billerName },
              { label: confirm.intent.identifierLabel, value: confirm.intent.identifier || "—" },
              {
                label: "Name",
                value: confirm.intent.customerName ?? "Not confirmed by this biller",
              },
              {
                label: "Amount",
                value: formatAmount(confirm.intent.currency, confirm.intent.amount),
                emphasis: true,
              },
            ]
          : undefined
      }
      confirmLabel="Pay now"
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
  );
}

function Receipt({
  token,
  units,
  pending,
  onDone,
}: {
  token: string | null;
  units: string | null;
  pending: boolean;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <Banner
        tone={pending ? "info" : "success"}
        title={pending ? "Payment submitted" : "Payment complete"}
      >
        {pending
          ? "We'll confirm this shortly — it'll show up in your activity."
          : "All done. The receipt is in your activity if you need it again."}
      </Banner>

      {/* Large, with its own copy button: without the token the customer
          cannot load the units they just bought. */}
      {token && <CopyField label="Meter token" value={token} emphasis />}
      {units && <p className="text-center text-sm text-muted-foreground">{units} units</p>}

      <Button fullWidth onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

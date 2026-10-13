"use client";

import { useActionState, useRef, useState } from "react";
import { TextField, PasswordField, SelectField } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/Button";
import { Banner, Card, DetailRow } from "@/components/ui/Primitives";
import { ConfirmDialog, useConfirm, type ConfirmRow } from "@/components/ui/ConfirmDialog";
import {
  setWithdrawalRecipient,
  confirmRecipientChange,
  requestRecipientChange,
} from "@/lib/actions/withdrawals";
import { RECIPIENT_CHANGE_HOLD_HOURS, recipientFieldError } from "@/lib/withdrawals/rules";
import { currencyMeta } from "@/lib/currencies";
import type { Currency, WithdrawalRecipient } from "@/lib/types/database";
import type { BushaBank } from "@/lib/busha/client";

/**
 * Payout destinations, one per currency.
 *
 * Per currency, not one per account: a single recipient per user permanently
 * blocks anyone who saved an NGN account from ever withdrawing anything else.
 *
 * Adding a NEW currency's first destination is ungated. CHANGING an existing
 * one requires the account password, re-verified server-side — changing where
 * money goes is the highest-value action in the whole app, and an attacker
 * with a session but no password must not be able to redirect a payout.
 *
 * The field shape follows the corridor: a bank account for naira and cedis, an
 * M-Pesa number for shillings, a wallet address for USDT. Nigerian banks come
 * from the provider's own list because it expects its OWN bank codes, not the
 * standard national ones.
 */
export function RecipientCard({
  currencies,
  recipients,
  banks,
}: {
  currencies: Currency[];
  recipients: WithdrawalRecipient[];
  banks: BushaBank[];
}) {
  const [currency, setCurrency] = useState<Currency>(currencies[0] ?? "NGN");
  const existing = recipients.find((r) => r.currency === currency);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Where your money goes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One destination per currency. The account name has to match your verified name.
        </p>
      </div>

      <SelectField
        label="Currency"
        value={currency}
        onChange={(e) => setCurrency(e.target.value as Currency)}
      >
        {currencies.map((code) => (
          <option key={code} value={code}>
            {currencyMeta(code).flag} {code}
            {recipients.some((r) => r.currency === code) ? " · saved" : ""}
          </option>
        ))}
      </SelectField>

      {existing ? (
        <ExistingRecipient key={currency} currency={currency} recipient={existing} banks={banks} />
      ) : (
        <NewRecipient key={currency} currency={currency} banks={banks} />
      )}
    </Card>
  );
}

function RecipientFields({
  currency,
  banks,
  defaults,
}: {
  currency: Currency;
  banks: BushaBank[];
  defaults?: WithdrawalRecipient;
}) {
  // The bank select posts BOTH name and code, because the provider's recipient
  // body needs the name and its own internal code, and the pair is re-checked
  // server-side before it is stored.
  const [bankValue, setBankValue] = useState(() =>
    defaults?.bank_code && defaults.bank_name
      ? `${defaults.bank_code}|${defaults.bank_name}`
      : "",
  );
  const [code, name] = bankValue.split("|");

  return (
    <>
      <TextField
        name="accountHolderName"
        label="Account holder name"
        hint="Must match your verified name"
        defaultValue={defaults?.account_holder_name ?? ""}
        autoComplete="name"
        required
      />

      {currency === "USDT" && (
        <TextField
          name="walletAddress"
          label="USDT wallet address"
          hint="BSC network only"
          defaultValue={defaults?.wallet_address ?? ""}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          placeholder="0x…"
        />
      )}

      {currency === "KES" && (
        <TextField
          name="bankAccountNumber"
          label="M-Pesa phone number"
          type="tel"
          inputMode="tel"
          defaultValue={defaults?.bank_account_number ?? ""}
          required
          placeholder="+254…"
        />
      )}

      {currency === "NGN" && (
        <>
          <SelectField
            label="Bank"
            value={bankValue}
            onChange={(e) => setBankValue(e.target.value)}
            required
          >
            <option value="" disabled>
              Choose your bank
            </option>
            {banks.map((bank) => (
              <option key={bank.code} value={`${bank.code}|${bank.name}`}>
                {bank.name}
              </option>
            ))}
          </SelectField>
          <input type="hidden" name="bankCode" value={code ?? ""} />
          <input type="hidden" name="bankName" value={name ?? ""} />

          <TextField
            name="bankAccountNumber"
            label="Account number"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={defaults?.bank_account_number ?? ""}
            required
            placeholder="10 digits"
          />
        </>
      )}

      {currency === "GHS" && (
        <>
          <TextField
            name="bankName"
            label="Bank name"
            defaultValue={defaults?.bank_name ?? ""}
            required
          />
          <TextField
            name="bankAccountNumber"
            label="Account number"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={defaults?.bank_account_number ?? ""}
            required
          />
        </>
      )}
    </>
  );
}

/**
 * Validate, then confirm, then submit — shared by the add and change forms.
 *
 * The fields are uncontrolled (they are prefilled from the saved recipient),
 * so the snapshot is read out of the form's own FormData at the moment of
 * submit rather than mirrored into React state.
 */
function useRecipientConfirm(currency: Currency) {
  const confirm = useConfirm<ConfirmRow[]>();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (confirmedRef.current) {
      confirmedRef.current = false;
      return;
    }
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const read = (key: string) => String(data.get(key) ?? "").trim();

    const error = recipientFieldError(currency, {
      bankAccountNumber: read("bankAccountNumber"),
      walletAddress: read("walletAddress"),
    });
    if (error) {
      setFieldError(error);
      return;
    }
    setFieldError(null);

    const rows: ConfirmRow[] = [{ label: "Name", value: read("accountHolderName") }];
    if (currency === "USDT") {
      rows.push({ label: "Wallet (BSC)", value: read("walletAddress"), emphasis: true });
    } else {
      if (read("bankName")) rows.push({ label: "Bank", value: read("bankName") });
      rows.push({
        label: currency === "KES" ? "M-Pesa number" : "Account number",
        value: read("bankAccountNumber"),
        emphasis: true,
      });
    }
    confirm.ask(rows);
  }

  return {
    confirm,
    formRef,
    onSubmit,
    fieldError,
    runConfirmed: () =>
      confirm.confirm(() => {
        confirmedRef.current = true;
        formRef.current?.requestSubmit();
      }),
  };
}

function NewRecipient({ currency, banks }: { currency: Currency; banks: BushaBank[] }) {
  const [state, formAction] = useActionState(setWithdrawalRecipient, {});
  const { confirm, formRef, onSubmit, fieldError, runConfirmed } = useRecipientConfirm(currency);

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="currency" value={currency} />
        <RecipientFields currency={currency} banks={banks} />

        {(fieldError ?? state.error) && (
          <Banner live tone="danger" title="Check this before we save it">
            {fieldError ?? state.error}
          </Banner>
        )}
        {state.ok && <Banner live tone="success" title="Destination saved" />}

        <SubmitButton pendingLabel="Saving…">Save destination</SubmitButton>
      </form>

      <ConfirmDialog
        open={confirm.open}
        title="Is this where your money should go?"
        body="Read it back once. A payout sent to the wrong account cannot be recalled by us or by your bank."
        rows={confirm.intent ?? undefined}
        confirmLabel="Save destination"
        cancelLabel="Let me check"
        onCancel={confirm.cancel}
        onConfirm={runConfirmed}
      />
    </>
  );
}

function ExistingRecipient({
  currency,
  recipient,
  banks,
}: {
  currency: Currency;
  recipient: WithdrawalRecipient;
  banks: BushaBank[];
}) {
  const [state, formAction] = useActionState(confirmRecipientChange, {});
  const [changing, setChanging] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { confirm, formRef, onSubmit, fieldError, runConfirmed } = useRecipientConfirm(currency);

  async function startChange() {
    // Marks the change as properly requested, so confirm cannot be called
    // cold. The password check itself happens on submit.
    const result = await requestRecipientChange(currency);
    if (result.error) setRequestError(result.error);
    else {
      setRequestError(null);
      setChanging(true);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-secondary px-3">
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
      </div>

      {requestError && (
        <Banner live tone="danger" title="Couldn't start that change">
          {requestError}
        </Banner>
      )}
      {state.ok && <Banner live tone="success" title="Destination updated" />}

      {changing ? (
        <form ref={formRef} action={formAction} onSubmit={onSubmit} className="space-y-3">
          <input type="hidden" name="currency" value={currency} />
          <RecipientFields currency={currency} banks={banks} defaults={recipient} />

          {fieldError && (
            <Banner live tone="danger" title="Check this before we save it">
              {fieldError}
            </Banner>
          )}

          <PasswordField
            name="password"
            label="Your account password"
            hint="To confirm it's you"
            autoComplete="current-password"
            required
            error={state.error}
          />

          <SubmitButton pendingLabel="Saving…">Update destination</SubmitButton>
        </form>
      ) : (
        <button
          type="button"
          onClick={startChange}
          className="min-h-11 text-sm font-medium text-primary"
        >
          Change destination
        </button>
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Change where your money goes?"
        body={`Every future ${currency} withdrawal goes here instead. Automated payouts also pause for ${RECIPIENT_CHANGE_HOLD_HOURS} hours after a change, so the next one will be reviewed by a person before it leaves.`}
        rows={confirm.intent ?? undefined}
        confirmLabel="Update destination"
        cancelLabel="Let me check"
        destructive
        onCancel={confirm.cancel}
        onConfirm={runConfirmed}
      />
    </div>
  );
}

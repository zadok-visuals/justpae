"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { TextField, FieldError } from "@/components/ui/Field";
import { Banner, Card } from "@/components/ui/Primitives";
import {
  setManualDepositAccount,
  setManualDepositLimits,
} from "@/lib/actions/adminManualDeposits";
import type { ManualDepositConfig } from "@/lib/deposits/manualDeposit";

/**
 * The naira bank-transfer deposit settings (migration 0037).
 *
 * TWO FORMS, NOT SIX. The payout settings above this get one form per field,
 * because they are independent numbers and a single form would make every
 * save rewrite all of them. These are not independent: a bank name without
 * its account number is not a half-saved preference, it is an instruction
 * telling a customer to send money to an incomplete address. So the account
 * saves as one object, and the three limits — which an operator reviews
 * together — save as another.
 *
 * NOT setAppSetting, which validates every value as a number. Two of the
 * three account fields are text.
 */
export function ManualDepositSettingsForm({ config }: { config: ManualDepositConfig }) {
  const [accountState, accountAction] = useActionState(setManualDepositAccount, {});
  const [limitsState, limitsAction] = useActionState(setManualDepositLimits, {});

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Naira deposit account</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Where customers are told to transfer naira. Shown on the deposit screen only once
          all three are set — until then the screen says deposits are being set up rather
          than showing a half-filled account.
        </p>
      </div>

      {accountState.ok && <Banner tone="success" title={accountState.message ?? "Saved"} />}

      <form action={accountAction} className="space-y-2">
        <TextField
          name="bankName"
          label="Bank"
          defaultValue={config.bankName}
          placeholder="e.g. Guaranty Trust Bank"
          required
        />
        <TextField
          name="accountNumber"
          label="Account number"
          hint="10 digits"
          inputMode="numeric"
          defaultValue={config.accountNumber}
          required
        />
        <TextField
          name="accountName"
          label="Account name"
          defaultValue={config.accountName}
          required
        />
        <SubmitButton size="sm" fullWidth={false} pendingLabel="Saving…">
          Save account
        </SubmitButton>
        <FieldError>{accountState.error}</FieldError>
      </form>

      <div className="border-t border-border pt-4">
        <h2 className="text-base font-semibold text-foreground">Naira deposit limits</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Quoted on the screen before an amount is accepted, and enforced again inside the
          database. The fee is flat and comes off what actually arrived.
        </p>
      </div>

      {limitsState.ok && <Banner tone="success" title={limitsState.message ?? "Saved"} />}

      <form action={limitsAction} className="space-y-2">
        <TextField
          name="minAmount"
          label="Smallest deposit"
          hint="NGN"
          inputMode="decimal"
          defaultValue={String(config.minAmount)}
          required
        />
        <TextField
          name="maxAmount"
          label="Largest deposit in one request"
          hint="NGN"
          inputMode="decimal"
          defaultValue={String(config.maxAmount)}
          required
        />
        <TextField
          name="fee"
          label="Flat fee"
          hint="NGN — 0 for none"
          inputMode="decimal"
          defaultValue={String(config.fee)}
          required
        />
        <SubmitButton size="sm" fullWidth={false} pendingLabel="Saving…">
          Save limits
        </SubmitButton>
        <FieldError>{limitsState.error}</FieldError>
      </form>

      {/* The one number on this rail an admin cannot change, said here
          because the queue is where they meet it. */}
      <p className="text-xs text-muted-foreground">
        Approvals of NGN 1,000,000 or more always need a second, different admin. That threshold
        is fixed in the database and is deliberately not editable here.
      </p>
    </Card>
  );
}

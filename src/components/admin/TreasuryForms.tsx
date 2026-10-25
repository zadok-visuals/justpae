"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { TextField, SelectField, FieldError } from "@/components/ui/Field";
import { Banner, Card } from "@/components/ui/Primitives";
import {
  recordTreasuryMovement,
  setSweepAccount,
  setSweepSetting,
  sweepNow,
} from "@/lib/actions/adminTreasury";
import { SETTING_KEYS } from "@/lib/settings";
import { CURRENCY_CODES } from "@/lib/currencies";
import type { SweepSettings } from "@/lib/treasury/sweep";

/**
 * The treasury's three forms.
 *
 * The sweep destination is ONE form and the dials are one each, for the same
 * reason the naira deposit account is: a bank code saved without its account
 * number is not a half-saved preference, it is a destination that exists and
 * is not the one anybody meant. The dials are independent numbers.
 */

export function MovementForm() {
  const [state, action] = useActionState(recordTreasuryMovement, {});

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Record a movement</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          A transfer somebody made by hand between Korapay, Busha and the company
          account. Recorded only — no customer balance moves, and nothing is sent.
        </p>
      </div>

      {state.ok && <Banner tone="success" title={state.message ?? "Recorded"} />}

      <form action={action} className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <SelectField name="currency" label="Currency" defaultValue="NGN">
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </SelectField>
          <TextField name="amount" label="Amount" inputMode="decimal" required />
        </div>
        <TextField name="fromAccount" label="From" placeholder="e.g. Korapay NGN balance" required />
        <TextField name="toAccount" label="To" placeholder="e.g. Busha funding account" required />
        <div className="grid gap-2 sm:grid-cols-2">
          <TextField
            name="reference"
            label="Reference"
            hint="Your bank's, so this row can be matched to a statement"
            required
          />
          <TextField name="occurredOn" label="Date" placeholder="YYYY-MM-DD" />
        </div>
        <TextField name="note" label="Note" />
        <SubmitButton size="sm" fullWidth={false} pendingLabel="Recording…">
          Record movement
        </SubmitButton>
        <FieldError>{state.error}</FieldError>
      </form>
    </Card>
  );
}

export function SweepSettingsForm({
  settings,
  flagEnabled,
  paused,
}: {
  settings: SweepSettings;
  flagEnabled: boolean;
  paused: boolean;
}) {
  const [accountState, accountAction] = useActionState(setSweepAccount, {});

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Daily sweep</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Moves naira from the Korapay balance, where deposits land, to the Busha funding
          account, where payouts leave from. Runs once a day at the time below.
        </p>
      </div>

      {!flagEnabled && (
        <Banner tone="warning" title="The sweep is switched off for this deployment">
          Everything saved here is stored and nothing runs until
          NEXT_PUBLIC_FEATURE_KORAPAY_AUTO_SWEEP is set.
        </Banner>
      )}

      {paused && (
        <Banner tone="warning" title="Paused for 24 hours">
          The destination was changed recently. The sweep does not run until the pause
          expires — that delay is the point of it.
        </Banner>
      )}

      {accountState.ok && <Banner tone="success" title={accountState.message ?? "Saved"} />}

      <form action={accountAction} className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <TextField
            name="bankCode"
            label="Funding account bank code"
            defaultValue={settings.bankCode}
            required
          />
          <TextField
            name="accountNumber"
            label="Funding account number"
            inputMode="numeric"
            defaultValue={settings.accountNumber}
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {settings.accountName
            ? `Confirmed with the bank as "${settings.accountName}".`
            : "The name is not typed — it is whatever the bank returns for this pair."}
        </p>
        <SubmitButton size="sm" fullWidth={false} pendingLabel="Confirming…">
          Save destination
        </SubmitButton>
        <FieldError>{accountState.error}</FieldError>
      </form>

      <div className="space-y-3 border-t border-border pt-4">
        <SweepDial
          settingKey={SETTING_KEYS.sweepMinKeepNgn}
          label="Keep in the Korapay balance (NGN)"
          value={String(settings.minKeep)}
        />
        <SweepDial
          settingKey={SETTING_KEYS.sweepTargetPayoutNgn}
          label="Target Busha balance (NGN)"
          value={String(settings.target)}
        />
        <SweepDial
          settingKey={SETTING_KEYS.sweepMaxDailyNgn}
          label="Most to move in one day (NGN)"
          value={String(settings.maxDaily)}
        />
        <SweepDial
          settingKey={SETTING_KEYS.sweepTimeLagos}
          label="Sweep time (Lagos, HH:MM)"
          value={settings.timeLagos}
        />
      </div>
    </Card>
  );
}

function SweepDial({
  settingKey,
  label,
  value,
}: {
  settingKey: string;
  label: string;
  value: string;
}) {
  const [state, action] = useActionState(setSweepSetting, {});

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="key" value={settingKey} />
      <div className="min-w-[14rem] flex-1">
        <TextField name="value" label={label} defaultValue={value} />
      </div>
      <SubmitButton size="sm" fullWidth={false} pendingLabel="Saving…">
        Save
      </SubmitButton>
      <FieldError>{state.error}</FieldError>
      {state.ok && <span className="text-xs text-success">Saved</span>}
    </form>
  );
}

/** Runs the sweep immediately, under every rule the cron follows but the clock. */
export function SweepNowButton({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState(sweepNow, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <SubmitButton size="sm" fullWidth={false} disabled={disabled} pendingLabel="Sweeping…">
        Sweep now
      </SubmitButton>
      {state.ok && <span className="text-xs text-success">{state.message}</span>}
      <FieldError>{state.error}</FieldError>
    </form>
  );
}

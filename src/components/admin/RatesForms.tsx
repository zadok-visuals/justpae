"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { SelectField, TextField, FieldError } from "@/components/ui/Field";
import { Banner, Card } from "@/components/ui/Primitives";
import { setRateMarkup, setAppSetting } from "@/lib/actions/admin";
import { SETTING_KEYS } from "@/lib/settings";
import { CURRENCY_CODES } from "@/lib/currencies";

/**
 * Markup editor.
 *
 * Markups are per ORDERED pair, so NGN→USDT and USDT→NGN are separate rows.
 * They carry genuinely different spreads on the provider side, and one
 * symmetric number would force the same margin onto both directions.
 *
 * Entered as a percentage because that is how an operator thinks about a
 * spread; the conversion to a fraction happens once, server-side.
 */
export function RateMarkupForm() {
  const [state, formAction] = useActionState(setRateMarkup, {});

  const pairs = CURRENCY_CODES.flatMap((base) =>
    CURRENCY_CODES.filter((quote) => quote !== base).map((quote) => `${base}/${quote}`),
  );

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Markup per pair</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The customer rate is the provider rate less this spread. Each direction is priced on its
          own.
        </p>
      </div>

      {state.ok && <Banner tone="success" title="Markup updated" />}

      <form action={formAction} className="space-y-3">
        <SelectField name="pair" label="Pair" required defaultValue="">
          <option value="" disabled>
            Choose a pair
          </option>
          {pairs.map((pair) => (
            <option key={pair} value={pair}>
              {pair.replace("/", " → ")}
            </option>
          ))}
        </SelectField>

        <TextField
          name="markupPercent"
          label="Markup"
          hint="Percent"
          inputMode="decimal"
          required
          placeholder="0.5"
          trailing="%"
          error={state.error}
        />

        <SubmitButton pendingLabel="Saving…">Save markup</SubmitButton>
      </form>
    </Card>
  );
}

/**
 * The operator-tunable settings.
 *
 * These were hardcoded constants. The automation threshold in particular was a
 * literal buried three files from any admin surface, which meant changing the
 * risk appetite of the entire payout system required a code deploy.
 */
export function SettingsForm({ values }: { values: Record<string, string> }) {
  const [state, formAction] = useActionState(setAppSetting, {});

  const settings = [
    {
      key: SETTING_KEYS.automatedPayoutThresholdUsd,
      label: "Instant payout limit",
      hint: "USD equivalent",
      help: "At or below this, payouts go out automatically. Above it, they wait for you.",
    },
    {
      key: SETTING_KEYS.automatedPayoutWindowHours,
      label: "Rolling window",
      hint: "Hours",
      help: "A user's withdrawals over this window are summed and checked against the same limit, so one large withdrawal can't be split into several small automatic ones.",
    },
    {
      key: SETTING_KEYS.withdrawalFeeRate,
      label: "Withdrawal fee",
      hint: "Fraction, e.g. 0.01 for 1%",
      help: "Deducted from the amount; the recipient receives the remainder.",
    },
  ];

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Payout settings</h2>
      </div>

      {state.ok && <Banner tone="success" title="Setting saved" />}

      <div className="space-y-5">
        {settings.map((setting) => (
          // One form per setting rather than one form with three fields: a
          // single form would make every save rewrite all three, so a stale
          // field left open in another tab would quietly revert the others.
          <form key={setting.key} action={formAction} className="space-y-2">
            <input type="hidden" name="key" value={setting.key} />
            <TextField
              name="value"
              label={setting.label}
              hint={setting.hint}
              inputMode="decimal"
              defaultValue={values[setting.key] ?? ""}
              required
            />
            <p className="text-xs text-muted-foreground">{setting.help}</p>
            <SubmitButton size="sm" fullWidth={false} pendingLabel="Saving…">
              Save
            </SubmitButton>
          </form>
        ))}
      </div>

      <FieldError>{state.error}</FieldError>
    </Card>
  );
}

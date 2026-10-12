"use client";

import { useActionState, useState } from "react";
import { saveOnboardingBasics, type OnboardingBasicsState } from "@/lib/actions/kyc";
import { SubmitButton } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Banner, Card } from "@/components/ui/Primitives";

/**
 * Stage one of onboarding: two questions, then the dashboard.
 *
 * The account-type cards are real radio inputs under the styling rather than
 * buttons driving a hidden field. Radios give keyboard arrow-key selection,
 * an announced group, and native required-ness for free; the version built
 * from <button type="button"> has to reimplement all three and usually
 * reimplements none of them.
 */
const ACCOUNT_TYPES = [
  {
    value: "individual",
    title: "Personal",
    description: "You're using justpae for yourself.",
  },
  {
    value: "business",
    title: "Business",
    description: "You're using it for a registered company.",
  },
] as const;

const initialState: OnboardingBasicsState = {};

export function KycTypeSelector({
  phoneHint,
  defaultPhone,
  defaultType,
}: {
  /** Country-aware placeholder, resolved server-side from the profile. */
  phoneHint: string;
  defaultPhone: string;
  defaultType: "individual" | "business" | null;
}) {
  const [state, formAction] = useActionState(saveOnboardingBasics, initialState);
  const [accountType, setAccountType] = useState<"individual" | "business" | null>(defaultType);
  const [phone, setPhone] = useState(defaultPhone);

  const canSubmit = accountType !== null && phone.trim().length > 0;

  return (
    <form action={formAction} className="space-y-4">
      <Card className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-foreground">
            What kind of account is this?
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {ACCOUNT_TYPES.map((option) => {
              const selected = accountType === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-secondary hover:border-input"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="accountType"
                      value={option.value}
                      checked={selected}
                      onChange={() => setAccountType(option.value)}
                      className="size-4 accent-primary"
                    />
                    <span className="text-base font-semibold text-foreground">{option.title}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">{option.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <TextField
          name="phone"
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="done"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={phoneHint}
          hint="So we can reach you about a payment"
          required
        />
      </Card>

      {state.error && (
        <Banner tone="danger" title="Couldn't save that">
          {state.error}
        </Banner>
      )}

      <SubmitButton disabled={!canSubmit} pendingLabel="Saving…">
        Save and go to dashboard
      </SubmitButton>

      {!canSubmit && (
        <p className="text-center text-xs text-muted-foreground">
          {accountType === null
            ? "Pick personal or business to continue."
            : "Add your phone number to continue."}
        </p>
      )}
    </form>
  );
}

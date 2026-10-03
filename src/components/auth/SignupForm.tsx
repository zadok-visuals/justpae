"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { TextField, PasswordField, SelectField } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/Button";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { signUp, signInWithGoogle } from "@/lib/actions/auth";
import { COUNTRIES, LOCAL_WALLET_COUNTRIES } from "@/lib/countries";
import { PASSWORD_REQUIREMENT_HINT } from "@/lib/passwordStrength";

export function SignupForm() {
  const [state, formAction] = useActionState(signUp, {});
  const [password, setPassword] = useState("");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dollars, naira, cedis, shillings and USDT in one place.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <TextField
          name="fullName"
          label="Full name"
          hint="As it appears on your ID"
          autoComplete="name"
          enterKeyHint="next"
          required
          placeholder="Your full name"
        />

        <TextField
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="next"
          required
          placeholder="you@example.com"
        />

        {/* The country drives which local wallet gets provisioned, so it is
            asked at signup rather than later — a user with no country gets a
            dollar and USDT wallet and no local one, which is a confusing
            half-state to recover from. */}
        <SelectField
          name="country"
          label="Country"
          hint="Where you live"
          required
          defaultValue=""
        >
          <option value="" disabled>
            Choose your country
          </option>
          {/* The three markets with a local wallet are grouped first so they
              are reachable without scrolling past 150 others. */}
          <optgroup label="We're live here">
            {COUNTRIES.filter((c) => LOCAL_WALLET_COUNTRIES.has(c.code)).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Everywhere else">
            {COUNTRIES.filter((c) => !LOCAL_WALLET_COUNTRIES.has(c.code)).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </SelectField>

        <div>
          <PasswordField
            name="password"
            label="Password"
            hint={PASSWORD_REQUIREMENT_HINT}
            autoComplete="new-password"
            enterKeyHint="go"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={state.error}
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={signInWithGoogle}>
        <SubmitButton variant="secondary" pendingLabel="Opening Google…">
          Continue with Google
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center px-1 font-medium text-primary"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { TextField, PasswordField } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Primitives";
import { requestPasswordReset, resetPassword } from "@/lib/actions/auth";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, {});

  if (state.sent) {
    return (
      <div className="space-y-5">
        <Banner tone="success" title="Check your email">
          If that address has an account, a reset link is on its way. The link works in any
          browser, not just this one.
        </Banner>
        <Link
          href="/login"
          className="mx-auto flex min-h-11 w-fit items-center px-3 text-sm font-medium text-primary"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll email you a link to set a new one.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <TextField
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="send"
          required
          placeholder="you@example.com"
          error={state.error}
        />

        <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
      </form>

      <Link
        href="/login"
        className="mx-auto flex min-h-11 w-fit items-center px-3 text-sm font-medium text-primary"
      >
        Back to sign in
      </Link>
    </div>
  );
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPassword, {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose something you haven&apos;t used here before.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <PasswordField
          name="password"
          label="New password"
          hint="At least 8 characters"
          autoComplete="new-password"
          enterKeyHint="next"
          required
          minLength={8}
        />

        <PasswordField
          name="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
          enterKeyHint="go"
          required
          minLength={8}
          error={state.error}
        />

        <SubmitButton pendingLabel="Saving…">Save new password</SubmitButton>
      </form>
    </div>
  );
}

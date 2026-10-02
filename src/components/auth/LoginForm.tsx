"use client";

import { useActionState } from "react";
import Link from "next/link";
import { TextField, PasswordField } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Primitives";
import { logIn, signInWithGoogle } from "@/lib/actions/auth";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction] = useActionState(logIn, {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your justpae account.</p>
      </div>

      {notice && (
        <Banner tone="success" title="Password updated">
          Sign in with your new password.
        </Banner>
      )}

      <form action={formAction} className="space-y-4">
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

        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          enterKeyHint="go"
          required
          error={state.error}
        />

        <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Google sign-in is its own form posting to its own action, not a
          button inside the password form — nesting it there would submit the
          email and password fields along with it. */}
      <form action={signInWithGoogle}>
        <SubmitButton variant="secondary" pendingLabel="Opening Google…">
          Continue with Google
        </SubmitButton>
      </form>

      <div className="space-y-2 text-center text-sm">
        <p>
          <Link href="/forgot-password" className="font-medium text-primary">
            Forgot your password?
          </Link>
        </p>
        <p className="text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium text-primary">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

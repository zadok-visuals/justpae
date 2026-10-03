"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { OtpField } from "@/components/ui/OtpField";
import { SubmitButton } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Primitives";
import { verifySignupCode, resendSignupCode } from "@/lib/actions/auth";

export function VerifyCodeForm({ email }: { email: string }) {
  const [verifyState, verifyAction] = useActionState(verifySignupCode, {});
  const [resendState, resendAction] = useActionState(resendSignupCode, {});
  const [code, setCode] = useState("");

  return (
    <div className="w-full max-w-sm space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Check your email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
          Enter it below to finish setting up your account.
        </p>
      </div>

      <form action={verifyAction} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <OtpField
          value={code}
          onValueChange={setCode}
          name="code"
          error={verifyState.error}
          autoFocus
        />
        <SubmitButton pendingLabel="Verifying…" disabled={code.length !== 6}>
          Verify email
        </SubmitButton>
      </form>

      {resendState.sent && (
        <Banner tone="success" title="Code resent">
          Check your inbox — it can take a minute to arrive.
        </Banner>
      )}
      {resendState.error && (
        <Banner tone="danger" title="Couldn't resend the code">
          {resendState.error}
        </Banner>
      )}

      <form action={resendAction}>
        <input type="hidden" name="email" value={email} />
        <SubmitButton variant="secondary" pendingLabel="Sending…">
          Resend code
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Wrong email?{" "}
        <Link
          href="/signup"
          className="inline-flex min-h-11 items-center px-1 font-medium text-primary"
        >
          Start over
        </Link>
      </p>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button, SubmitButton } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { OtpField } from "@/components/ui/OtpField";
import {
  startTotpEnrollment,
  verifyTotpEnrollment,
  challengeTotp,
  unenrollTotp,
  type MfaActionState,
  type TotpEnrollment,
} from "@/lib/actions/mfa";

/**
 * The admin second-factor screen. One component, three states, because they
 * are three steps of one job and splitting them across routes would mean
 * keeping three gates in step.
 *
 *   not enrolled           → scan the QR, then confirm a code
 *   enrolled, aal1         → type a code to raise this session to aal2
 *   enrolled, aal2         → nothing to do; offer removal
 */
export function MfaSetup({
  enrolled,
  aal2,
  factorId,
}: {
  enrolled: boolean;
  aal2: boolean;
  /** The verified factor, when there is one — needed to remove it. */
  factorId: string | null;
}) {
  if (!enrolled) return <Enrol />;
  if (!aal2) return <Challenge />;
  return <Enrolled factorId={factorId} />;
}

function Enrol() {
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, formAction] = useActionState<MfaActionState, FormData>(verifyTotpEnrollment, {});
  const [code, setCode] = useState("");

  // Started on mount rather than behind a "Begin setup" button: an admin who
  // landed here was sent here, and has no other way forward, so a button
  // asking them to confirm the thing they cannot avoid is a wasted tap.
  useEffect(() => {
    startTransition(async () => {
      const result = await startTotpEnrollment();
      if (result.enrollment) setEnrollment(result.enrollment);
      else setStartError(result.error ?? "Couldn't start setup.");
    });
  }, []);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  if (startError) {
    return (
      <div className="space-y-3">
        <FieldError>{startError}</FieldError>
        <Button onClick={() => window.location.reload()} variant="secondary">
          Try again
        </Button>
      </div>
    );
  }

  if (starting || !enrollment) {
    return <p className="text-sm text-muted-foreground">Setting up…</p>;
  }

  return (
    <div className="space-y-5">
      <ol className="space-y-2 text-sm text-muted-foreground">
        <li>1. Install an authenticator app — Google Authenticator, 1Password, Authy.</li>
        <li>2. Scan this code with it.</li>
        <li>3. Type the 6-digit code it shows.</li>
      </ol>

      {/* The QR is an SVG data URI minted by the auth server. unoptimized
          because there is nothing for an image optimiser to do to an inline
          SVG except fail to fetch it. The white backing is not decoration: a
          QR rendered dark-on-dark in the dark theme does not scan. */}
      <div className="flex justify-center">
        <div className="rounded-xl bg-white p-3">
          <Image
            src={enrollment.qrCode}
            alt="Authenticator setup QR code"
            width={200}
            height={200}
            unoptimized
          />
        </div>
      </div>

      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer leading-11 text-muted-foreground">
          Can&apos;t scan it?
        </summary>
        <p className="mt-1 text-muted-foreground">Enter this key in your app by hand:</p>
        <p className="mt-1 break-all rounded-lg bg-secondary px-3 py-2 font-mono text-xs text-foreground">
          {enrollment.secret}
        </p>
      </details>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="factorId" value={enrollment.factorId} />
        <OtpField name="code" label="Code from your app" value={code} onValueChange={setCode} autoFocus />
        <SubmitButton pendingLabel="Checking…">Confirm and turn on</SubmitButton>
        <FieldError>{state.error}</FieldError>
      </form>
    </div>
  );
}

function Challenge() {
  const [state, formAction] = useActionState<MfaActionState, FormData>(challengeTotp, {});
  const [code, setCode] = useState("");

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Open your authenticator app and enter the current code for JustPae.
      </p>
      <OtpField name="code" label="Code from your app" value={code} onValueChange={setCode} autoFocus />
      <SubmitButton pendingLabel="Checking…">Continue</SubmitButton>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}

function Enrolled({ factorId }: { factorId: string | null }) {
  const [state, formAction] = useActionState<MfaActionState, FormData>(unenrollTotp, {});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground">
        Two-factor authentication is on, and this session is verified.
      </p>
      <p className="text-sm text-muted-foreground">
        You&apos;ll be asked for a code each time you sign in and open the admin tools.
      </p>

      {!confirming ? (
        <Button variant="secondary" size="sm" fullWidth={false} onClick={() => setConfirming(true)}>
          Remove authenticator
        </Button>
      ) : (
        <form action={formAction} className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-semibold text-foreground">
            Removing it locks you out of the admin tools
          </p>
          <p className="text-sm text-muted-foreground">
            You won&apos;t be able to open any admin page until you set up an authenticator again.
            Do this only if you&apos;re moving to a new phone and have the new one to hand.
          </p>
          <input type="hidden" name="factorId" value={factorId ?? ""} />
          <div className="flex gap-2">
            <SubmitButton variant="danger" size="sm" fullWidth={false} pendingLabel="Removing…">
              Remove it
            </SubmitButton>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-11 px-3 text-sm font-medium text-muted-foreground"
            >
              Keep it
            </button>
          </div>
          <FieldError>{state.error}</FieldError>
        </form>
      )}
    </div>
  );
}

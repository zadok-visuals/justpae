"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { TextField, FieldError } from "@/components/ui/Field";
import { Card } from "@/components/ui/Primitives";
import { saveBvn } from "@/lib/actions/kyc";
import { KYC_ID_FIELDS } from "@/lib/countries";

/**
 * The one question an already-verified Nigerian user is asked the first time
 * they open naira deposit without a BVN on file.
 *
 * WHY THEY ARE BEING ASKED AT ALL IS SAID OUT LOUD. Being stopped by a form
 * on a screen you have used before, for a number you believe you already
 * gave, reads as a bug or a shakedown unless the reason is on the screen. It
 * is one sentence and it earns its place.
 *
 * NO PROVIDER IS NAMED. "Your bank needs it" is both true — the account is
 * issued by a bank, against the BVN — and the only framing a customer can act
 * on. Whose API we call is not their concern and never appears in this copy.
 */
export function BvnPrompt({
  masked,
  /**
   * Run once the BVN is saved. The deposit screen uses it to issue the
   * account number immediately — making somebody press a second button for
   * the thing they have just enabled reads as the form not having worked.
   */
  onSaved,
}: {
  masked: string | null;
  onSaved?: () => void;
}) {
  const [state, action] = useActionState(saveBvn, {});
  const saved = state.masked ?? masked;

  // Fires on the transition from "not saved" to "saved", not on every
  // render: a second call would issue nothing new but would cost a provider
  // round trip on every re-render of a settled screen.
  const announced = useRef(false);
  useEffect(() => {
    if (saved && onSaved && !announced.current) {
      announced.current = true;
      onSaved();
    }
  }, [saved, onSaved]);

  if (saved) {
    return (
      <Card className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">BVN on file</h2>
        <p className="text-sm tabular-nums text-foreground">{saved}</p>
        <p className="text-xs text-muted-foreground">
          We only ever show the last four digits. Contact support if this needs to change.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">One more thing first</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account number has to be issued against your BVN — that is the bank&apos;s rule,
          not ours. You only do this once.
        </p>
      </div>

      <form action={action} className="space-y-3">
        <TextField
          name="bvn"
          label="BVN"
          hint={KYC_ID_FIELDS.NG.hint}
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          maxLength={11}
          required
        />
        <SubmitButton pendingLabel="Saving…">Save and continue</SubmitButton>
        <FieldError>{state.error}</FieldError>
      </form>

      <p className="text-xs text-muted-foreground">
        A BVN doesn&apos;t let anyone move your money. We store it to have your account number
        issued, show only the last four digits afterwards, and never share it.
      </p>
    </Card>
  );
}

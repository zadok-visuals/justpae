"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SubmitButton, Button } from "@/components/ui/Button";
import { TextField, FieldError } from "@/components/ui/Field";
import { Card } from "@/components/ui/Primitives";
import { saveBvn } from "@/lib/actions/kyc";
import { KYC_ID_FIELDS } from "@/lib/countries";
import { FLAGS } from "@/lib/flags";
import { maskBvn, isValidBvn } from "@/lib/kyc/bvn";
import { bvnConfirmationMatches } from "@/lib/kyc/bvnFlow";
import { ChangeBvnForm } from "@/components/deposit/ChangeBvnForm";

/**
 * The one question an already-verified Nigerian user is asked the first time
 * they open naira deposit without a BVN on file.
 *
 * GROUP 4 — a confirm field and a confirm SCREEN, both client-side and both
 * ahead of the one server round trip that actually saves anything: "enter"
 * collects BVN + Confirm BVN and checks they match before moving on;
 * "confirm" shows the masked value back and only "Yes, save it" calls
 * saveBvn. The server re-checks the confirm match too (precheckSaveBvn) —
 * this screen is about not submitting a typo, not the only thing standing
 * between one.
 *
 * NO PROVIDER IS NAMED. "Your account number is issued against your BVN" is
 * both true and the only framing a customer can act on. Whose API we call is
 * not their concern and never appears in this copy.
 */
export function BvnPrompt({
  masked,
  /** Set only when this screen is shown again right after Korapay rejected
   *  the BVN that used to be here — see VirtualAccountState's "needs_bvn"
   *  variant in src/lib/korapay/virtualAccount.ts. */
  initialError,
  /** Whether a naira virtual account has already been issued. Always false
   *  for the deposit step itself (an issued account never renders this
   *  component at all), kept as a prop so Profile's BVN card can reuse the
   *  same saved-state rendering with its own, possibly-locked answer. */
  hasIssuedAccount = false,
  /**
   * Run once the BVN is saved. The deposit screen uses it to issue the
   * account number immediately — making somebody press a second button for
   * the thing they have just enabled reads as the form not having worked.
   */
  onSaved,
}: {
  masked: string | null;
  initialError?: string;
  hasIssuedAccount?: boolean;
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
          We only show the last 4 digits and never share it.
        </p>
        {hasIssuedAccount ? (
          <p className="text-xs text-muted-foreground">Contact support to change your BVN.</p>
        ) : (
          <ChangeBvnForm />
        )}
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Add your BVN</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account number is issued against your BVN. You only do this once.
        </p>
      </div>

      <BvnEntry action={action} error={state.error ?? initialError} />

      <p className="text-xs text-muted-foreground">
        We only show the last 4 digits and never share it.
      </p>
    </Card>
  );
}

/**
 * The two client-side steps ahead of the one server submit: typing the
 * number twice, then a "is this right?" screen showing the mask back.
 * `action` is only ever invoked from the confirm step's "Yes, save it".
 */
function BvnEntry({
  action,
  error,
}: {
  action: (formData: FormData) => void;
  error?: string;
}) {
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [bvn, setBvn] = useState("");
  const [confirmBvn, setConfirmBvn] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function continueToConfirm() {
    const trimmed = bvn.trim();
    if (!trimmed) {
      setLocalError("Enter your BVN to continue.");
      return;
    }
    if (!isValidBvn(trimmed)) {
      setLocalError("A BVN is exactly 11 digits. Dial *565*0# to get it.");
      return;
    }
    if (!bvnConfirmationMatches(bvn, confirmBvn)) {
      setLocalError("Those two don't match. Re-enter your BVN.");
      return;
    }
    setLocalError(null);
    setStep("confirm");
  }

  if (step === "confirm") {
    return (
      <form action={action} className="space-y-3">
        <input type="hidden" name="bvn" value={bvn} />
        <input type="hidden" name="confirmBvn" value={confirmBvn} />
        <p className="text-sm text-foreground">
          Is this right? <span className="font-mono tabular-nums">{maskBvn(bvn)}</span>
        </p>
        <div className="flex gap-2">
          <SubmitButton fullWidth={false} pendingLabel="Saving…">
            Yes, save it
          </SubmitButton>
          <Button type="button" variant="secondary" fullWidth={false} onClick={() => setStep("enter")}>
            Edit
          </Button>
        </div>
        <FieldError>{error}</FieldError>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <TextField
        name="bvn"
        label="BVN"
        hint={KYC_ID_FIELDS.NG.hint}
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        maxLength={11}
        required
        value={bvn}
        onChange={(e) => setBvn(e.target.value)}
      />
      <TextField
        name="confirmBvn"
        label="Confirm BVN"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        maxLength={11}
        required
        value={confirmBvn}
        onChange={(e) => setConfirmBvn(e.target.value)}
      />
      {FLAGS.bvnValidation && (
        <p className="text-xs text-muted-foreground">
          By continuing, you allow justpae to verify your BVN with our verification partner.
        </p>
      )}
      <Button type="button" fullWidth onClick={continueToConfirm}>
        Continue
      </Button>
      <FieldError>{localError ?? error}</FieldError>
    </div>
  );
}

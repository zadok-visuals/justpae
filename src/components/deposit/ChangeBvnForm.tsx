"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton, Button } from "@/components/ui/Button";
import { TextField, FieldError } from "@/components/ui/Field";
import { PinField } from "@/components/ui/PinField";
import { changeBvn } from "@/lib/actions/kyc";

/**
 * GROUP 4 — the "Change BVN" link under a masked BVN, shown only while no
 * virtual account has been issued against it (the parent — BvnPrompt or
 * Profile's BVN card — decides that and shows the locked message instead
 * when it is false; this component does not re-check it, it is simply not
 * rendered).
 *
 * Collapsed by default: a form with a PIN field sitting open under a value
 * most people never touch is a bigger, scarier card for no benefit. Opens
 * into BVN + Confirm BVN + PIN — the same confirm-field rule saveBvn's entry
 * step applies, re-checked server-side by changeBvn regardless of what this
 * form does client-side.
 */
export function ChangeBvnForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [state, action] = useActionState(changeBvn, {});

  // changeBvn revalidates /deposit and /profile, but a Server Component tree
  // already on screen does not refetch on its own — this is what pulls the
  // fresh masked value and the (now possibly different) lock state in.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (state.ok) {
    return <p className="text-xs text-foreground">BVN updated — ending {state.masked?.slice(-4) ?? ""}.</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center text-xs font-medium text-primary"
      >
        Change BVN
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3 border-t border-border pt-3">
      <TextField
        name="bvn"
        label="New BVN"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        maxLength={11}
        required
      />
      <TextField
        name="confirmBvn"
        label="Confirm new BVN"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        maxLength={11}
        required
      />
      <PinField name="pin" label="Transaction PIN" value={pin} onValueChange={setPin} />
      <div className="flex gap-2">
        <SubmitButton fullWidth={false} pendingLabel="Saving…">
          Save new BVN
        </SubmitButton>
        <Button type="button" variant="secondary" fullWidth={false} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}

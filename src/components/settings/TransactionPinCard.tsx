"use client";

import { useActionState, useRef, useState } from "react";
import { PinField } from "@/components/ui/PinField";
import { PasswordField } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/Button";
import { Banner, Card, Pill } from "@/components/ui/Primitives";
import { ConfirmDialog, useConfirm } from "@/components/ui/ConfirmDialog";
import { setTransactionPin, changeTransactionPin } from "@/lib/actions/withdrawals";

/**
 * The transaction PIN card.
 *
 * Setting a PIN for the first time needs nothing but the PIN. CHANGING one
 * requires the account password, re-verified server-side immediately before
 * the change — a self-service PIN change with no re-verification is exactly
 * the hole a PIN exists to close, since anyone with a borrowed unlocked phone
 * could otherwise set their own.
 */
export function TransactionPinCard({ hasPin }: { hasPin: boolean }) {
  const [setState, setAction] = useActionState(setTransactionPin, {});
  const [changeState, changeAction] = useActionState(changeTransactionPin, {});
  const [changing, setChanging] = useState(false);

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // One hook for both branches — only one of the two forms is ever mounted.
  const confirm = useConfirm<"set" | "change">();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);

  function askThenSubmit(mode: "set" | "change") {
    return (event: React.FormEvent<HTMLFormElement>) => {
      if (confirmedRef.current) {
        confirmedRef.current = false;
        return;
      }
      event.preventDefault();
      confirm.ask(mode);
    };
  }

  const runConfirmed = () =>
    confirm.confirm(() => {
      confirmedRef.current = true;
      formRef.current?.requestSubmit();
    });

  if (!hasPin) {
    return (
      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Transaction PIN</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A 4-6 digit PIN, separate from your password, confirms every conversion, withdrawal
            and bill payment.
          </p>
        </div>

        {setState.ok && <Banner tone="success" title="PIN set" />}

        <form ref={formRef} action={setAction} onSubmit={askThenSubmit("set")} className="space-y-3">
          <PinField label="New PIN" value={pin} onValueChange={setPin} />
          <PinField
            name="confirmPin"
            label="Confirm PIN"
            value={confirmPin}
            onValueChange={setConfirmPin}
            error={setState.error}
          />
          <SubmitButton disabled={pin.length < 4 || pin !== confirmPin} pendingLabel="Saving…">
            Set PIN
          </SubmitButton>
        </form>

        <ConfirmDialog
          open={confirm.open}
          title="Set this PIN?"
          body="You'll need it to confirm every conversion, withdrawal and bill payment — so pick something you'll remember and nobody else would guess. Changing it later needs your account password."
          confirmLabel="Set PIN"
          onCancel={confirm.cancel}
          onConfirm={runConfirmed}
        />
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Transaction PIN</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Used to confirm every money-out action.
          </p>
        </div>
        <Pill tone="success">Set</Pill>
      </div>

      {changeState.ok && <Banner tone="success" title="PIN changed" />}

      {changing ? (
        <form
          ref={formRef}
          action={changeAction}
          onSubmit={askThenSubmit("change")}
          className="space-y-3"
        >
          <PinField label="New PIN" value={pin} onValueChange={setPin} />
          <PinField
            name="confirmPin"
            label="Confirm new PIN"
            value={confirmPin}
            onValueChange={setConfirmPin}
          />
          <PasswordField
            name="password"
            label="Your account password"
            hint="To confirm it's you"
            autoComplete="current-password"
            required
            error={changeState.error}
          />
          <SubmitButton disabled={pin.length < 4 || pin !== confirmPin} pendingLabel="Saving…">
            Change PIN
          </SubmitButton>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="min-h-11 text-sm font-medium text-primary"
        >
          Change PIN
        </button>
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Change your PIN?"
        body="Your current PIN stops working the moment this goes through. If you share this account with nobody, that's the point — but make sure the new one is what you meant to type."
        confirmLabel="Change PIN"
        destructive
        onCancel={confirm.cancel}
        onConfirm={runConfirmed}
      />
    </Card>
  );
}

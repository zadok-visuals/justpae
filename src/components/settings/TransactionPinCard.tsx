"use client";

import { useActionState, useState } from "react";
import { PinField } from "@/components/ui/PinField";
import { PasswordField } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/Button";
import { Banner, Card, Pill } from "@/components/ui/Primitives";
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

        <form action={setAction} className="space-y-3">
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
        <form action={changeAction} className="space-y-3">
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
    </Card>
  );
}

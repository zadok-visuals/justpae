"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { FieldError, TextField, TextAreaField } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Primitives";
import { approveManualDeposit, rejectManualDeposit } from "@/lib/actions/adminManualDeposits";

/**
 * Approve or reject one manual naira deposit.
 *
 * THE AMOUNT FIELD IS THE POINT OF THIS COMPONENT, and it is deliberately
 * NOT a hidden input pre-filled with what the customer requested. On every
 * other deposit rail the provider re-reports what actually arrived; here the
 * only source of that figure is an admin reading a bank statement, and a
 * transfer of 45,000 against a request for 50,000 must credit 45,000. It is
 * pre-filled with the requested amount as a convenience — most transfers do
 * match — but it is an editable field, the admin is told to check it, and
 * what the form sends is what the server credits.
 *
 * Nothing here enforces the two-admin rule for large approvals. That lives
 * inside approve_manual_deposit, under the same row lock as the credit: a
 * disabled button is not a control, because the action is reachable by POST
 * whatever this page rendered. The UI's job is to show the outcome the
 * function reports.
 */
export function ManualDepositQueueActions({
  depositId,
  requestedAmount,
  firstApproverEmail,
  firstApprovalAmount,
}: {
  depositId: string;
  /** Pre-fills the field. Not what credits — see the note above. */
  requestedAmount: string;
  /** Set when a first admin has already signed off a large approval. */
  firstApproverEmail?: string | null;
  firstApprovalAmount?: string | null;
}) {
  const [approveState, approveAction] = useActionState(approveManualDeposit, {});
  const [rejectState, rejectAction] = useActionState(rejectManualDeposit, {});
  const [rejecting, setRejecting] = useState(false);

  if (rejecting) {
    return (
      <form action={rejectAction} className="space-y-2">
        <input type="hidden" name="depositId" value={depositId} />
        <TextAreaField
          name="reason"
          label="Why are you rejecting this?"
          hint="The customer reads this. Nothing is credited."
          required
          placeholder="e.g. No transfer with this reference has reached our account."
          defaultValue={rejectState.values?.reason ?? ""}
        />
        <div className="flex gap-2">
          <SubmitButton variant="danger" size="sm" fullWidth={false} pendingLabel="Rejecting…">
            Reject
          </SubmitButton>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="min-h-11 px-3 text-sm font-medium text-muted-foreground"
          >
            Cancel
          </button>
        </div>
        <FieldError>{rejectState.error}</FieldError>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      {firstApproverEmail && (
        // Shown before the field, because it changes what the admin must
        // type: the second signature has to be for the same figure, or the
        // function refuses it.
        <Banner tone="info" title="One approval already recorded">
          {firstApproverEmail} approved {firstApprovalAmount ?? "an amount"}. Agree that exact
          figure to credit it, or ask them to withdraw their approval.
        </Banner>
      )}

      {approveState.message && (
        <Banner tone={approveState.ok ? "success" : "info"} title="Done">
          {approveState.message}
        </Banner>
      )}

      <form action={approveAction} className="space-y-2">
        <input type="hidden" name="depositId" value={depositId} />
        <TextField
          name="receivedAmount"
          label="Amount that actually arrived"
          hint="Read it off the statement — it can differ from what they asked for"
          inputMode="decimal"
          required
          defaultValue={approveState.values?.receivedAmount ?? requestedAmount}
        />
        <div className="flex flex-wrap gap-2">
          <SubmitButton size="sm" fullWidth={false} pendingLabel="Crediting…">
            Approve and credit
          </SubmitButton>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium text-destructive"
          >
            Reject
          </button>
        </div>
        <FieldError>{approveState.error ?? rejectState.error}</FieldError>
      </form>
    </div>
  );
}

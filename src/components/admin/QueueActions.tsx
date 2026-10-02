"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { FieldError, TextAreaField } from "@/components/ui/Field";
import {
  approveKyc,
  rejectKyc,
  completeWithdrawal,
  rejectWithdrawal,
  confirmWithdrawalVerification,
} from "@/lib/actions/admin";

/**
 * Admin queue actions.
 *
 * Each destructive action asks for a reason in an expandable form rather than
 * a confirm dialog. The reason is not ceremony: it is what the user actually
 * sees, and an approve/reject pair with no required explanation produces
 * rejections that tell the customer nothing and guarantee a resubmission of
 * exactly the same thing.
 */
export function KycQueueActions({ userId }: { userId: string }) {
  const [approveState, approveAction] = useActionState(approveKyc, {});
  const [rejectState, rejectAction] = useActionState(rejectKyc, {});
  const [rejecting, setRejecting] = useState(false);

  if (rejecting) {
    return (
      <form action={rejectAction} className="space-y-2">
        <input type="hidden" name="userId" value={userId} />
        <TextAreaField
          name="reason"
          label="Why are you rejecting this?"
          hint="The customer sees this"
          required
          placeholder="e.g. The ID photo is too blurry to read the number."
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
    <div className="flex flex-wrap items-center gap-2">
      <form action={approveAction}>
        <input type="hidden" name="userId" value={userId} />
        <SubmitButton size="sm" fullWidth={false} pendingLabel="Approving…">
          Approve
        </SubmitButton>
      </form>

      <button
        type="button"
        onClick={() => setRejecting(true)}
        className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium text-destructive"
      >
        Reject
      </button>

      <FieldError>{approveState.error}</FieldError>
    </div>
  );
}

export function WithdrawalQueueActions({
  transactionId,
  requiresVerification,
  verified,
}: {
  transactionId: string;
  requiresVerification: boolean;
  verified: boolean;
}) {
  const [completeState, completeAction] = useActionState(completeWithdrawal, {});
  const [rejectState, rejectAction] = useActionState(rejectWithdrawal, {});
  const [confirmState, confirmAction] = useActionState(confirmWithdrawalVerification, {});
  const [rejecting, setRejecting] = useState(false);

  // Above-threshold withdrawals cannot be marked paid out until the extra
  // verification is recorded. The MECHANISM is deliberately not built — which
  // check to run is an operational decision nobody has made — so this records
  // that a human confirmed it happened out of band rather than faking a check.
  const needsVerificationFirst = requiresVerification && !verified;

  if (rejecting) {
    return (
      <form action={rejectAction} className="space-y-2">
        <input type="hidden" name="transactionId" value={transactionId} />
        <TextAreaField
          name="reason"
          label="Why are you rejecting this?"
          hint="The customer sees this. Their balance is refunded."
          placeholder="e.g. Account details don't match the verified name."
        />
        <div className="flex gap-2">
          <SubmitButton variant="danger" size="sm" fullWidth={false} pendingLabel="Rejecting…">
            Reject and refund
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
    <div className="flex flex-wrap items-center gap-2">
      {needsVerificationFirst && (
        <form action={confirmAction}>
          <input type="hidden" name="transactionId" value={transactionId} />
          <SubmitButton
            variant="secondary"
            size="sm"
            fullWidth={false}
            pendingLabel="Recording…"
          >
            Record verification
          </SubmitButton>
        </form>
      )}

      <form action={completeAction}>
        <input type="hidden" name="transactionId" value={transactionId} />
        <SubmitButton
          size="sm"
          fullWidth={false}
          disabled={needsVerificationFirst}
          pendingLabel="Saving…"
        >
          Mark paid out
        </SubmitButton>
      </form>

      <button
        type="button"
        onClick={() => setRejecting(true)}
        className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium text-destructive"
      >
        Reject
      </button>

      <FieldError>{completeState.error ?? confirmState.error}</FieldError>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { FieldError, TextAreaField } from "@/components/ui/Field";
import { replyToSupportThread } from "@/lib/actions/support";
import { SUPPORT_MESSAGE_MAX_LENGTH } from "@/lib/support/constants";

/**
 * The admin's reply box.
 *
 * Text only, deliberately: the customer-facing composer accepts a screenshot
 * because a customer explaining a problem often needs to show it, while an
 * admin replying has nothing to attach that a sentence wouldn't say better —
 * and admin uploads would need a service-role signed upload URL, since the
 * storage policies confine every folder to its own owner and an admin owns
 * none of them. If that is ever wanted it is a deliberate piece of work, not
 * a prop on this form.
 */
export function SupportReplyForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(replyToSupportThread, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the box only once the reply has actually landed. Resetting on submit
  // would throw away what the admin typed if the send failed.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <TextAreaField
        name="body"
        label="Reply"
        hint="The customer sees this, and gets an email"
        required
        maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
        placeholder="Write your reply…"
      />
      <SubmitButton pendingLabel="Sending…">Send reply</SubmitButton>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}

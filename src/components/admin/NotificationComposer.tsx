"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/ui/Button";
import { FieldError, TextField, TextAreaField } from "@/components/ui/Field";
import { sendNotification } from "@/lib/actions/notifications";

/**
 * Admin notification compose.
 *
 * TARGETED BY EMAIL, NOT BY ID. The action resolves the email to a user id
 * server-side and refuses an address with no account. An admin hand-typing a
 * uuid is a transcription error waiting to happen, and the failure mode is
 * sending one customer's account notice to a different customer.
 *
 * THE BROADCAST IS THE DEFAULT, and it says how many people it reached
 * afterwards — not before. A "this will go to N users" preview invites an
 * admin to treat N as the thing being confirmed, when the thing worth
 * confirming is the wording.
 */
export function NotificationComposer() {
  const [state, formAction] = useActionState(sendNotification, {});
  const [audience, setAudience] = useState<"broadcast" | "user">("broadcast");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) {
      toast.success(
        state.recipients === 1
          ? "Notification sent."
          : `Notification sent to ${state.recipients ?? 0} ${
              state.recipients === 1 ? "person" : "people"
            }.`,
      );
      // reset() on the form clears the text inputs, which are uncontrolled.
      // The audience radios are controlled and so are untouched by it — left
      // deliberately where the admin put them rather than snapped back to
      // "Everyone", because sending a second notice to the same person is the
      // common follow-up and re-picking them every time is friction. (It also
      // keeps this effect free of setState, which is the rule the rest of this
      // codebase follows.)
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-foreground">Who gets this</legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          {(
            [
              { value: "broadcast", label: "Everyone" },
              { value: "user", label: "One person" },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                audience === option.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary text-muted-foreground"
              }`}
            >
              <input
                type="radio"
                name="audience"
                value={option.value}
                checked={audience === option.value}
                onChange={() => setAudience(option.value)}
                className="accent-primary"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Every defaultValue below reads from the action state, which carries
          the draft back on failure and NOT on success. That split is what
          lets the reset() above still clear the composer after a send, while
          a rejected send — a bad link, an email with no account — keeps the
          wording the admin just wrote. */}
      {audience === "user" && (
        <TextField
          name="targetEmail"
          label="Their email"
          type="email"
          required
          autoComplete="off"
          placeholder="customer@example.com"
          defaultValue={state.values?.targetEmail ?? ""}
        />
      )}

      <TextField
        name="title"
        label="Title"
        required
        maxLength={120}
        placeholder="e.g. Scheduled maintenance on Sunday"
        defaultValue={state.values?.title ?? ""}
      />

      <TextAreaField
        name="body"
        label="Message"
        required
        maxLength={600}
        placeholder="Keep it short — this is read in a dropdown, not an inbox."
        defaultValue={state.values?.body ?? ""}
      />

      <TextField
        name="href"
        label="Link (optional)"
        hint="A path inside the app"
        // Mirrors both the action's regex and the table's own check
        // constraint. An in-app notification that can point at an external URL
        // is a phishing primitive, so it is refused in all three places.
        pattern="^/[A-Za-z0-9/_?=&.\-]*$"
        placeholder="/transactions"
        defaultValue={state.values?.href ?? ""}
      />

      <SubmitButton pendingLabel="Sending…">Send notification</SubmitButton>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}

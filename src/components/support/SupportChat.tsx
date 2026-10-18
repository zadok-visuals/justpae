"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { PaperclipIcon, SendIcon } from "@/components/layout/NavIcons";
import { Spinner } from "@/components/ui/Button";
import {
  sendSupportMessage,
  markMySupportThreadRead,
  type SendSupportMessageState,
} from "@/lib/actions/support";
import { uploadToStorage } from "@/lib/storage/clientUpload";
import {
  SUPPORT_BUCKET,
  SUPPORT_ATTACHMENT_TYPES,
  SUPPORT_MESSAGE_MAX_LENGTH,
} from "@/lib/support/constants";
import { buildThread, type DeliveryStatus } from "@/lib/support/thread";
import type { SupportMessage } from "@/lib/types/database";

/**
 * The customer's side of the support thread.
 *
 * WHY THE ATTACHMENT UPLOADS ON SELECTION rather than travelling in the form:
 * the same reason KYC does it (see src/lib/storage/clientUpload.ts). A screen
 * photo off a phone is several megabytes and a server action's body limit is
 * 1MB, so the request would be rejected before sendSupportMessage ever ran —
 * and the person reporting a bug would hit a second, worse one. The form only
 * ever carries the storage path, which the action re-verifies as own-folder
 * before writing it to a row an admin will open.
 *
 * WHY IT POLLS. A support thread where the reply doesn't appear is not a
 * support thread. Realtime would be the better mechanism, but it needs a
 * websocket, a subscription lifecycle and RLS-on-replication set up for one
 * table, to serve a page a user has open for a minute at a time. A visibility-
 * gated refresh every 20s costs one cheap request while the tab is actually in
 * front of someone and nothing at all when it isn't.
 */

const POLL_INTERVAL_MS = 20_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The date a run of messages belongs to.
 *
 * A horizontal rule with the day in the middle, which is the shape every
 * chat uses, because it reads as "time passed here" rather than as another
 * message. aria-hidden on the rules so a screen reader hears the date once.
 */
function DaySeparator({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-3 py-1">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </li>
  );
}

function Bubble({
  message,
  attachmentUrl,
  status,
}: {
  message: SupportMessage;
  attachmentUrl?: string;
  status: DeliveryStatus | null;
}) {
  const fromUser = message.sender === "user";

  return (
    <li className={`flex ${fromUser ? "justify-end" : "justify-start"}`}>
      <div className="flex max-w-[85%] flex-col gap-1 sm:max-w-[70%]">
        <div
          className={`rounded-2xl px-3.5 py-2.5 ${
            fromUser
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md border border-border bg-card text-foreground"
          }`}
        >
          {!fromUser && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">
              justpae support
            </p>
          )}

          {attachmentUrl && (
            // Signed URL from a private bucket, so it is host-arbitrary as far
            // as next/image is concerned — `unoptimized` keeps it out of the
            // optimiser, which would need the Supabase host allowlisted and
            // would cache a URL that expires in an hour.
            <a href={attachmentUrl} target="_blank" rel="noreferrer" className="mb-1.5 block">
              <Image
                src={attachmentUrl}
                alt="Attachment"
                width={320}
                height={320}
                unoptimized
                className="h-auto max-h-64 w-auto rounded-lg"
              />
            </a>
          )}

          {message.body && (
            // whitespace-pre-wrap: people press Enter in a support message and
            // a paragraph break they typed should still be there when the
            // other side reads it. break-words stops a pasted reference number
            // from widening the bubble past the column.
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.body}
            </p>
          )}
        </div>

        <div
          className={`flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground ${
            fromUser ? "justify-end" : ""
          }`}
        >
          <time dateTime={message.created_at} className="font-mono">
            {formatTime(message.created_at)}
          </time>
          {/* Only on the last of your own run — see buildThread. "Seen" is
              the one fact a sender wants and a column of "Sent" repeated
              down five bubbles is not it. */}
          {status && (
            <span className={status === "seen" ? "font-medium text-primary" : ""}>
              · {status === "seen" ? "Seen" : "Sent"}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-label="Send message"
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-gold-light disabled:bg-primary/40 disabled:text-primary-foreground/60"
    >
      {pending ? <Spinner className="size-4" /> : <SendIcon className="size-5" />}
    </button>
  );
}

export function SupportChat({
  userId,
  messages,
  attachmentUrls,
}: {
  userId: string;
  messages: SupportMessage[];
  attachmentUrls: Record<string, string>;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<SendSupportMessageState, FormData>(
    sendSupportMessage,
    {},
  );

  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<{ path: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  // Survives the optimistic clear, so a failed send is recoverable.
  const draftRef = useRef("");

  // Mark the admin's messages read as a side effect of the thread being on
  // screen. Done from the client, not the server page, because the action
  // calls revalidatePath to clear the header badge and revalidating during a
  // server render is unsupported — the same reason the bell marks read on open
  // rather than on paint.
  useEffect(() => {
    void markMySupportThreadRead();
  }, []);

  // Newest message in view on arrival and after each send. A chat that opens
  // at the top of a long history shows the least useful part of it.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // The composer is cleared when the message is SENT (in handleSubmit below),
  // not here once the server confirms — a chat whose text sits in the box for
  // a round trip after you press send feels broken. The cost of clearing
  // optimistically is that a failed send would throw away what someone typed,
  // which for a support message could be several paragraphs; so the draft is
  // kept in a ref and the failure toast offers it back.
  useEffect(() => {
    if (state.error) {
      toast.error(state.error, {
        action: draftRef.current
          ? { label: "Restore draft", onClick: () => setBody(draftRef.current) }
          : undefined,
      });
    }
  }, [state]);

  // Visibility-gated polling. document.hidden is checked on every tick rather
  // than only at setup, so a backgrounded tab stops costing requests without
  // needing a visibilitychange listener to tear the timer down and rebuild it.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // The bucket enforces both of these itself (migration 0017), so this is
    // for the message, not the gate: "that image is too large" at pick time is
    // better than a storage rejection after a wait.
    if (file.type && !SUPPORT_ATTACHMENT_TYPES.includes(file.type)) {
      toast.error("Please attach a photo (JPEG, PNG, WebP or GIF).");
      event.target.value = "";
      return;
    }

    setUploading(true);
    setAttachment(null);
    try {
      const path = await uploadToStorage({
        bucket: SUPPORT_BUCKET,
        userId,
        prefix: "support",
        file,
      });
      setAttachment({ path, name: file.name });
    } catch (err) {
      // uploadToStorage only ever throws already-user-safe messages.
      toast.error(err instanceof Error ? err.message : "That image didn't upload.");
      event.target.value = "";
    } finally {
      setUploading(false);
    }
  }

  const canSend = (body.trim().length > 0 || attachment !== null) && !uploading;

  // Wraps formAction so the clearing happens in an event handler rather than
  // in an effect reacting to the result. FormData is read by React before this
  // returns, so emptying the controlled state here cannot strip the body from
  // the request.
  function handleSubmit(formData: FormData) {
    draftRef.current = body;
    setBody("");
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    formAction(formData);
  }

  const items = buildThread(messages, "user");

  return (
    <div className="flex flex-col gap-4">
      {/* PINNED, not a message in the thread. A reassurance that scrolls away
          with the first reply is a reassurance nobody sees when they need it,
          which is while they are waiting. It says what we will and will not
          do, because the most expensive support outcome on a money product is
          a customer giving their PIN to someone claiming to be us. */}
      <p className="sticky top-0 z-10 rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
        A real person reads this and replies here, usually within a few hours.{" "}
        <span className="font-medium text-foreground">
          We will never ask for your PIN, your password or a verification code.
        </span>
      </p>

      {messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="font-medium text-foreground">No messages yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Tell us what&apos;s happening and we&apos;ll come back to you here. You can attach a
            screenshot if it helps.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) =>
            item.kind === "separator" ? (
              <DaySeparator key={item.key} label={item.label} />
            ) : (
              <Bubble
                key={item.key}
                message={item.message}
                status={item.status}
                attachmentUrl={
                  item.message.attachment_ref
                    ? attachmentUrls[item.message.attachment_ref]
                    : undefined
                }
              />
            ),
          )}
        </ul>
      )}
      <div ref={endRef} />

      <form ref={formRef} action={handleSubmit} className="sticky bottom-0 bg-background pb-1 pt-2">
        {attachment && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2">
            <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {attachment.name}
            </span>
            <button
              type="button"
              onClick={() => {
                setAttachment(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="shrink-0 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Remove
            </button>
          </div>
        )}

        <input type="hidden" name="attachment" value={attachment?.path ?? ""} />

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORT_ATTACHMENT_TYPES.join(",")}
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Attach a photo"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {uploading ? <Spinner className="size-4" /> : <PaperclipIcon className="size-5" />}
          </button>

          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter is a newline — but only from sm up.
              // On a phone the on-screen keyboard's return key IS the newline
              // key and there is no Shift to hold, so sending on Enter there
              // would make a two-paragraph message impossible to type.
              if (e.key === "Enter" && !e.shiftKey && window.innerWidth >= 640) {
                e.preventDefault();
                if (canSend) formRef.current?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
            placeholder="Write a message…"
            className="jp-field min-h-11 w-full resize-none rounded-lg border border-input bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
          />

          <SendButton disabled={!canSend} />
        </div>
      </form>
    </div>
  );
}

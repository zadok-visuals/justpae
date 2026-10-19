import Image from "next/image";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Primitives";
import { SupportReplyForm } from "@/components/admin/SupportReplyForm";
import { loadSupportThreadForAdmin } from "@/lib/actions/support";
import { buildThread } from "@/lib/support/thread";
import { BackButton } from "@/components/ui/BackButton";

export const metadata = { title: "Support thread · Admin" };
export const dynamic = "force-dynamic";

/**
 * One customer's thread, oldest first, with the reply box underneath.
 *
 * Opening the page marks the customer's messages read — loadSupportThreadForAdmin
 * does that itself, through the service role, which is the only side with a
 * path into another user's rows.
 */
export default async function AdminSupportThreadPage(
  props: PageProps<"/admin/support/[userId]">,
) {
  await requireAdminUser();
  const { userId } = await props.params;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name, kyc_status")
    .eq("id", userId)
    .maybeSingle();

  // A thread id that doesn't resolve to an account is a 404, not an empty
  // thread — an empty thread reads as "they wrote nothing", which is a
  // different and misleading fact.
  if (!profile) notFound();

  const { messages, attachmentUrls } = await loadSupportThreadForAdmin(userId);

  return (
    <div className="space-y-5">
      <div>
        {/* GROUP 5b. Was a grey link hard-coded to /admin/support, which is
            right for an admin who clicked through from the queue and wrong
            for one who opened a thread from a notification. The queue is now
            the fallback; the previous page is the destination. */}
        <BackButton
          fallbackHref="/admin/support"
          label="All threads"
          className="-my-2 mb-1"
        />
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {profile.full_name || profile.email}
        </h1>
        {/* Email and verification state together: an admin answering a question
            about withdrawals needs to know whether this account can withdraw
            at all before typing an answer. */}
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {profile.email} · verification {profile.kyc_status}
        </p>
      </div>

      {messages.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            This account has no messages. You can still open the conversation by replying below.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {buildThread(messages, "admin").map((item) => {
            if (item.kind === "separator") {
              return (
                <li key={item.key} className="flex items-center gap-3 py-1">
                  <span aria-hidden="true" className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                  <span aria-hidden="true" className="h-px flex-1 bg-border" />
                </li>
              );
            }

            const { message, status } = item;
            const fromUser = message.sender === "user";
            const attachmentUrl = message.attachment_ref
              ? attachmentUrls[message.attachment_ref]
              : undefined;

            return (
              <li key={item.key} className={`flex ${fromUser ? "justify-start" : "justify-end"}`}>
                <div className="flex max-w-[85%] flex-col gap-1 sm:max-w-[70%]">
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 ${
                      fromUser
                        ? "rounded-bl-md border border-border bg-card text-foreground"
                        : "rounded-br-md bg-primary text-primary-foreground"
                    }`}
                  >
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">
                      {fromUser ? "Customer" : "You"}
                    </p>

                    {attachmentUrl && (
                      // Signed URL against a private bucket, expiring in an
                      // hour — unoptimized keeps next/image from caching it
                      // and from needing the Supabase host allowlisted.
                      <a
                        href={attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-1.5 block"
                      >
                        <Image
                          src={attachmentUrl}
                          alt="Customer attachment"
                          width={320}
                          height={320}
                          unoptimized
                          className="h-auto max-h-64 w-auto rounded-lg"
                        />
                      </a>
                    )}

                    {message.body && (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {message.body}
                      </p>
                    )}
                  </div>

                  <div
                    className={`flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground ${
                      fromUser ? "" : "justify-end"
                    }`}
                  >
                    <time dateTime={message.created_at} className="font-mono">
                      {new Date(message.created_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    {/* On your own last reply only: whether the customer has
                        opened the thread since you sent it. */}
                    {status && (
                      <span className={status === "seen" ? "font-medium text-primary" : ""}>
                        · {status === "seen" ? "Seen" : "Sent"}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <SupportReplyForm userId={userId} />
      </Card>
    </div>
  );
}

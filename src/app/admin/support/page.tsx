import Link from "next/link";
import { Card, Pill } from "@/components/ui/Primitives";
import { listSupportThreads } from "@/lib/actions/support";

export const metadata = { title: "Support · Admin" };
export const dynamic = "force-dynamic";

/**
 * The support inbox: one row per customer who has ever written in, newest
 * first, with a count of what they have said that nobody has read.
 *
 * listSupportThreads calls requireAdminUser itself — the layout gating this
 * page is not what protects the data, since the action is reachable by POST
 * on its own.
 */
export default async function AdminSupportPage() {
  const threads = await listSupportThreads();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {threads.length === 0
            ? "Nobody has written in yet."
            : `${threads.length} ${threads.length === 1 ? "thread" : "threads"}.`}
        </p>
      </div>

      {threads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="font-medium text-foreground">Empty inbox</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Customer messages land here, and we email you when one arrives.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {threads.map((thread) => (
            <li key={thread.userId}>
              <Link href={`/admin/support/${thread.userId}`}>
                <Card className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {thread.fullName || thread.email || "Unknown account"}
                    </span>
                    {thread.unreadFromUser > 0 && (
                      <Pill tone="pending">
                        {thread.unreadFromUser} unread
                      </Pill>
                    )}
                  </div>

                  {/* The email is shown even when a name exists: it is how an
                      admin cross-references the account against every other
                      queue here, all of which key on email. */}
                  {thread.fullName && thread.email && (
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {thread.email}
                    </p>
                  )}

                  <p className="truncate text-sm text-muted-foreground">
                    {thread.lastMessagePreview}
                  </p>

                  <time
                    dateTime={thread.lastMessageAt}
                    className="block font-mono text-[0.6875rem] text-muted-foreground"
                  >
                    {new Date(thread.lastMessageAt).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Primitives";
import { NotificationComposer } from "@/components/admin/NotificationComposer";

export const metadata = { title: "Notifications · Admin" };
export const dynamic = "force-dynamic";

/**
 * Compose an in-app notification, and see the last few that went out.
 *
 * The history is here so an admin can tell whether the thing they are about to
 * announce has already been announced — the single most common duplicate-
 * broadcast cause — and because a send with no record of itself is impossible
 * to audit.
 */
export default async function AdminNotificationsPage() {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: recent } = await admin
    .from("notifications")
    .select("id, user_id, title, body, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Appears in the bell in the app header. Not an email.
        </p>
      </div>

      <Card>
        <NotificationComposer />
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recently sent
        </h2>

        {!recent || recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((row) => (
              <li key={row.id}>
                <Card className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {row.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {row.user_id ? "One person" : "Everyone"}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{row.body}</p>
                  <time
                    dateTime={row.created_at}
                    className="block font-mono text-[0.6875rem] text-muted-foreground"
                  >
                    {new Date(row.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

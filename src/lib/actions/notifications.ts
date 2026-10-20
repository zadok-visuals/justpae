"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";
import { appUrl, sendAnnouncementEmails } from "@/lib/email";
import type { Notification } from "@/lib/types/database";

/**
 * In-app notifications.
 *
 * Read state is per-user (notification_reads), not a column on the row, so a
 * broadcast is "read" by the people who have actually read it rather than by
 * everyone once the first person opens it. See supabase/migrations/0017 for
 * why that mattered enough to diverge from the original.
 *
 * Users have SELECT on notifications and nothing else — no insert, no update.
 * Composing is admin-only and goes through the service role.
 */

export interface NotificationListItem extends Notification {
  read: boolean;
}

/** The dropdown's payload: the newest notifications plus whether each is read. */
export async function listNotifications(limit = 15): Promise<NotificationListItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Two reads rather than an embedded join: notification_reads has no FK
  // relationship PostgREST would follow from this direction (it is keyed by
  // notification_id, and the rows a user can see include broadcasts they have
  // no read row for at all), so a left join here would silently drop exactly
  // the unread ones the bell exists to show.
  const [{ data: rows }, { data: reads }] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("notification_reads").select("notification_id"),
  ]);

  const readIds = new Set((reads ?? []).map((r) => r.notification_id));
  return (rows ?? []).map((row) => ({ ...row, read: readIds.has(row.id) }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data, error } = await supabase.rpc("unread_notification_count");
  if (error) {
    // A failed count must not break the header it renders in.
    console.error("[notifications.getUnreadNotificationCount] failed", error);
    return 0;
  }
  return data ?? 0;
}

/** Called when the dropdown opens. Idempotent. */
export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) {
    console.error("[notifications.markAllNotificationsRead] failed", error);
    return;
  }
  // The badge lives in the layout chrome, which is rendered on the server.
  revalidatePath("/", "layout");
}

export interface SendNotificationState {
  error?: string;
  ok?: boolean;
  /** How many users it reached, for the admin's confirmation line. */
  recipients?: number;
  /**
   * Echoed back on FAILURE only, so the React 19 form reset restores the
   * draft instead of blanking it. This is a composer — a few hundred
   * characters of carefully worded customer notice — and losing it to "no
   * account found for that email" is the kind of thing that gets a feature
   * quietly abandoned.
   *
   * Deliberately absent on success: the success path calls form.reset() to
   * clear the composer for the next notice, and echoing values back would
   * fight it.
   */
  values?: { title?: string; body?: string; href?: string; targetEmail?: string };
}

/**
 * Admin compose. Either a broadcast (no target) or one user.
 *
 * Targeting is by EMAIL in the form, resolved to an id server-side, because an
 * admin typing a uuid is a transcription error waiting to happen and the
 * failure mode is sending someone else's account notice to the wrong person.
 */
export async function sendNotification(
  _prevState: SendNotificationState,
  formData: FormData,
): Promise<SendNotificationState> {
  // Gates the ACTION, not just the page that renders its form — a server
  // action is reachable by POST whether or not that page was gated.
  const admin = await requireAdminUser();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const href = String(formData.get("href") ?? "").trim();
  const audience = String(formData.get("audience") ?? "broadcast");
  const targetEmail = String(formData.get("targetEmail") ?? "").trim().toLowerCase();
  const alsoEmail = formData.get("sendEmail") === "on";

  // Carried by every failure return below. The draft is the expensive thing
  // on this form; the admin can retype an email address, not a notice.
  const values = { title, body, href, targetEmail };

  if (!title) return { error: "Give it a title.", values };
  if (!body) return { error: "Write the message.", values };
  if (href && !/^\/[A-Za-z0-9/_?=&.-]*$/.test(href)) {
    // Mirrors the check constraint. An external link in an in-app notification
    // is a phishing primitive, so it is refused in both places.
    return { error: "The link must be a path inside the app, starting with /.", values };
  }

  const service = createAdminClient();
  let targetUserId: string | null = null;

  if (audience === "user") {
    if (!targetEmail) return { error: "Enter the email of the user to notify.", values };
    const { data: profile } = await service
      .from("profiles")
      .select("id")
      .eq("email", targetEmail)
      .maybeSingle();
    if (!profile) return { error: `No account found for ${targetEmail}.`, values };
    targetUserId = profile.id;
  }

  const { error } = await service.rpc("admin_send_notification", {
    p_user_id: targetUserId,
    p_title: title,
    p_body: body,
    p_href: href || null,
    p_created_by: admin.id,
  });

  if (error) {
    console.error("[notifications.sendNotification] failed", error);
    return { error: "Couldn't send that notification.", values };
  }

  let recipients = 1;
  if (!targetUserId) {
    const { count } = await service
      .from("profiles")
      .select("id", { count: "exact", head: true });
    recipients = count ?? 0;
  }

  // GROUP 5. Queued AFTER the response, not awaited here: the admin's
  // confirmation is the in-app notification existing, which already
  // happened above. A slow or failed Resend batch call must never turn into
  // a slow or failed "notification sent" for an action that, from the
  // database's point of view, already succeeded. email_announcements is the
  // one preference this respects — set in Profile, and scoped to exactly
  // this composer, never to an account or security notice.
  if (alsoEmail) {
    after(async () => {
      const emailRecipients = await resolveAnnouncementRecipients(service, targetUserId);
      if (emailRecipients.length === 0) return;

      const { failed } = await sendAnnouncementEmails({
        recipients: emailRecipients,
        subject: title,
        preheader: body.length > 140 ? `${body.slice(0, 140)}…` : body,
        heading: title,
        bodyParagraphs: [body],
        button: href ? { label: "Open it", href: `${appUrl()}${href}` } : undefined,
      });
      // sendAnnouncementEmails already logs each failed batch's own detail;
      // this is only the top-level signal that this particular broadcast had
      // losses, findable by the title an admin will recognise.
      if (failed > 0) {
        console.error("[notifications.sendNotification] some announcement emails did not send", {
          title,
          failed,
        });
      }
    });
  }

  revalidatePath("/admin/notifications");
  return { ok: true, recipients };
}

/**
 * The email addresses for the "also send by email" option — one user's, or
 * everyone who hasn't turned announcements off. Checked here rather than
 * left to RLS because this reads through the service-role client, the same
 * reason sendNotification uses it for the write above.
 */
async function resolveAnnouncementRecipients(
  service: ReturnType<typeof createAdminClient>,
  targetUserId: string | null,
): Promise<string[]> {
  if (targetUserId) {
    const { data } = await service
      .from("profiles")
      .select("email, email_announcements")
      .eq("id", targetUserId)
      .maybeSingle();
    return data?.email && data.email_announcements ? [data.email] : [];
  }

  const { data } = await service
    .from("profiles")
    .select("email")
    .eq("email_announcements", true)
    .not("email", "is", null);
  return (data ?? []).map((row) => row.email).filter((email): email is string => !!email);
}

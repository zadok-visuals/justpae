"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";
import { verifyOwnedUpload } from "@/lib/storage/verifyUpload";
import { sendSupportMessageEmail, adminNotificationRecipients } from "@/lib/email";
import { SUPPORT_BUCKET, SUPPORT_MESSAGE_MAX_LENGTH } from "@/lib/support/constants";
import type { SupportMessage } from "@/lib/types/database";

/**
 * Support chat. One thread per user, identified by user_id.
 *
 * The user's side goes through their own session under RLS; the admin's side
 * always goes through the service role, the same convention as every other
 * admin data path here.
 *
 * TWO THINGS A USER CANNOT DO, both enforced in the schema rather than here
 * (see supabase/migrations/0017):
 *   - insert a message with sender = 'admin'. Without that constraint they
 *     could author both sides of their own thread and then present it as a
 *     record of what support told them.
 *   - update any message at all. The original this is ported from allowed a
 *     row-scoped UPDATE so the user could stamp read_at — which also let them
 *     rewrite the body of messages already sent. Read receipts are a function.
 */

export interface SupportThread {
  messages: SupportMessage[];
  /** Signed URLs for attachments, keyed by storage path. The bucket is
   *  private, so an <img src> needs one of these, and they expire. */
  attachmentUrls: Record<string, string>;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function signAttachments(
  client: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>,
  messages: SupportMessage[],
): Promise<Record<string, string>> {
  const paths = messages
    .map((m) => m.attachment_ref)
    .filter((p): p is string => Boolean(p));
  if (paths.length === 0) return {};

  const { data, error } = await client.storage
    .from(SUPPORT_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) {
    // A thread that renders without its images is far better than a thread
    // that fails to render.
    console.error("[support.signAttachments] failed", error);
    return {};
  }

  const urls: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
  }
  return urls;
}

/** The user's own thread. Marks the admin's messages read as a side effect. */
export async function loadMySupportThread(): Promise<SupportThread> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { messages: [], attachmentUrls: {} };

  const { data, error } = await supabase
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[support.loadMySupportThread] failed", error);
    return { messages: [], attachmentUrls: {} };
  }

  const messages = (data ?? []) as SupportMessage[];
  const attachmentUrls = await signAttachments(supabase, messages);
  return { messages, attachmentUrls };
}

export async function markMySupportThreadRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.rpc("mark_support_thread_read");
  if (error) console.error("[support.markMySupportThreadRead] failed", error);
  revalidatePath("/", "layout");
}

export async function getUnreadSupportCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data, error } = await supabase.rpc("unread_support_count");
  if (error) {
    console.error("[support.getUnreadSupportCount] failed", error);
    return 0;
  }
  return data ?? 0;
}

export interface SendSupportMessageState {
  error?: string;
  ok?: boolean;
}

export async function sendSupportMessage(
  _prevState: SendSupportMessageState,
  formData: FormData,
): Promise<SendSupportMessageState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const body = String(formData.get("body") ?? "").trim();
  const attachmentPath = String(formData.get("attachment") ?? "").trim();

  if (!body && !attachmentPath) return { error: "Write a message or attach an image." };
  if (body.length > SUPPORT_MESSAGE_MAX_LENGTH) return { error: "That message is too long." };

  // The attachment arrives as a storage path the browser uploaded to directly
  // (same pattern, and for the same body-size reason, as the KYC uploads), so
  // it is untrusted input: re-checked for own-folder prefix and existence
  // before it is written into a row an admin will open.
  if (attachmentPath) {
    const ok = await verifyOwnedUpload(supabase, SUPPORT_BUCKET, user.id, attachmentPath);
    if (!ok) return { error: "That image didn't upload. Please try attaching it again." };
  }

  const { error } = await supabase.from("support_messages").insert({
    user_id: user.id,
    // The policy requires this to be 'user'; stating it here keeps the
    // failure a validation error rather than a confusing RLS denial.
    sender: "user",
    body: body || null,
    attachment_ref: attachmentPath || null,
  });

  if (error) {
    console.error("[support.sendSupportMessage] insert failed", { userId: user.id, error });
    return { error: "Couldn't send that message. Please try again." };
  }

  // Tell the team out of band. Not fatal: the message IS sent, and reporting
  // failure would make the user send it twice.
  const admins = adminNotificationRecipients();
  if (admins.length > 0) {
    await sendSupportMessageEmail({
      to: admins,
      fromName: user.email ?? "A customer",
      preview: body || "(an image)",
      forAdmin: true,
    });
  }

  revalidatePath("/support");
  return { ok: true };
}

// ── Admin side ─────────────────────────────────────────────────────────────

export interface AdminSupportThreadSummary {
  userId: string;
  email: string;
  fullName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadFromUser: number;
}

/**
 * The admin inbox: one row per user who has ever written in, newest first.
 *
 * Built in TypeScript from a single ordered read rather than a SQL aggregate
 * because the thread list needs the profile's name and email alongside the
 * last message, and the volumes here are small enough that one query plus a
 * group-by in memory is simpler to read and to change than a view.
 */
export async function listSupportThreads(): Promise<AdminSupportThreadSummary[]> {
  await requireAdminUser();
  const service = createAdminClient();

  const { data: messages, error } = await service
    .from("support_messages")
    .select("user_id, sender, body, attachment_ref, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    console.error("[support.listSupportThreads] failed", error);
    return [];
  }

  const byUser = new Map<string, AdminSupportThreadSummary>();
  for (const m of messages ?? []) {
    let entry = byUser.get(m.user_id);
    if (!entry) {
      // First time we see this user, and because the read is newest-first this
      // IS their latest message.
      entry = {
        userId: m.user_id,
        email: "",
        fullName: null,
        lastMessageAt: m.created_at,
        lastMessagePreview: m.body?.slice(0, 120) || "(an image)",
        unreadFromUser: 0,
      };
      byUser.set(m.user_id, entry);
    }
    if (m.sender === "user" && !m.read_at) entry.unreadFromUser += 1;
  }

  const userIds = [...byUser.keys()];
  if (userIds.length === 0) return [];

  const { data: profiles } = await service
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);

  for (const p of profiles ?? []) {
    const entry = byUser.get(p.id);
    if (entry) {
      entry.email = p.email;
      entry.fullName = p.full_name;
    }
  }

  return [...byUser.values()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export async function loadSupportThreadForAdmin(userId: string): Promise<SupportThread> {
  await requireAdminUser();
  const service = createAdminClient();

  const { data, error } = await service
    .from("support_messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[support.loadSupportThreadForAdmin] failed", { userId, error });
    return { messages: [], attachmentUrls: {} };
  }

  const messages = (data ?? []) as SupportMessage[];
  // Signed with the service role: the admin has no RLS path into a user's own
  // folder, by design.
  const attachmentUrls = await signAttachments(service, messages);

  await service.rpc("admin_mark_support_thread_read", { p_user_id: userId });

  return { messages, attachmentUrls };
}

export async function replyToSupportThread(
  _prevState: SendSupportMessageState,
  formData: FormData,
): Promise<SendSupportMessageState> {
  await requireAdminUser();

  const userId = String(formData.get("userId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!userId) return { error: "Missing the thread." };
  if (!body) return { error: "Write a reply." };
  if (body.length > SUPPORT_MESSAGE_MAX_LENGTH) return { error: "That reply is too long." };

  const service = createAdminClient();
  const { error } = await service.rpc("admin_send_support_message", {
    p_user_id: userId,
    p_body: body,
    p_attachment_ref: null,
  });

  if (error) {
    console.error("[support.replyToSupportThread] failed", { userId, error });
    return { error: "Couldn't send that reply." };
  }

  const { data: profile } = await service
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.email) {
    await sendSupportMessageEmail({
      to: profile.email,
      fromName: "justpae support",
      preview: body,
      forAdmin: false,
    });
  }

  revalidatePath(`/admin/support/${userId}`);
  revalidatePath("/admin/support");
  return { ok: true };
}

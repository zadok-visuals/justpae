"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser, logAdminActivity } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole, KycStatus } from "@/lib/types/database";
import { toRpcError } from "@/lib/provider-error";

/**
 * Phase 4: the people-shaped admin actions — suspension, reinstatement, and
 * granting or revoking admin access.
 *
 * Every function calls requireAdminUser(), which now also demands aal2. The
 * two role functions additionally demand `superadmin`: "can approve a KYC
 * document" and "can make somebody else an admin" are very different
 * privileges, and collapsing them is what makes one compromised admin account
 * the whole system.
 *
 * Everything here reaches the ledger, by one of two routes: the RPCs that have
 * a Postgres function of their own log from inside it (see 0019), and the
 * reads log from the action. The next admin capability anyone adds must pick
 * one of those two — an audit trail with holes in it is worse than useless,
 * because it is misleading about what it covers.
 */

export interface AdminUserActionState {
  error?: string;
  ok?: boolean;
}

export interface AdminUserSearchResult {
  id: string;
  email: string;
  fullName: string | null;
  kycStatus: KycStatus;
  country: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  /** Null when this account is not an admin. */
  adminRole: AdminRole | null;
}

/**
 * Search by email or name. Requires a query — deliberately no "list everyone"
 * default: an admin screen that opens with every account's email on it is a
 * data-exfiltration surface for one compromised admin session, and nobody
 * doing real work needs it. Suspended accounts are listable without a query,
 * through the separate call below, because that IS a list someone needs to
 * review.
 */
export async function searchUsers(query: string): Promise<AdminUserSearchResult[]> {
  const actor = await requireAdminUser();

  const term = query.trim();
  if (term.length < 2) return [];

  // READS GET LOGGED TOO, not only writes. The question an investigation asks
  // is usually "who looked up this customer", and a ledger that records only
  // changes cannot answer it. The search TERM is what is recorded rather than
  // the result set: it is what the admin actually chose to do, it is one row
  // instead of twenty-five, and it does not copy a page of other people's
  // email addresses into a table every admin can read.
  await logAdminActivity({
    adminId: actor.id,
    action: "user.search",
    detail: { query: term },
  });

  const service = createAdminClient();

  // `%` and `_` are wildcards in `ilike`, and `,` separates the branches of an
  // `or`. All three are escaped so a search for "a,b" is a search for the
  // literal text rather than a second filter the admin did not intend.
  const safe = term.replace(/[%_,]/g, (c) => `\\${c}`);

  const { data, error } = await service
    .from("profiles")
    .select("id, email, full_name, kyc_status, country, suspended_at, suspended_reason, created_at")
    .or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%`)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("[adminUsers.searchUsers] failed", error);
    return [];
  }

  return attachRoles(service, data ?? []);
}

/** Every currently-suspended account. The list exists to be reviewed. */
export async function listSuspendedUsers(): Promise<AdminUserSearchResult[]> {
  await requireAdminUser();
  const service = createAdminClient();

  const { data, error } = await service
    .from("profiles")
    .select("id, email, full_name, kyc_status, country, suspended_at, suspended_reason, created_at")
    .not("suspended_at", "is", null)
    .order("suspended_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[adminUsers.listSuspendedUsers] failed", error);
    return [];
  }

  return attachRoles(service, data ?? []);
}

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  kyc_status: KycStatus;
  country: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
};

/**
 * One extra query for the whole result set rather than admin_role_for per row.
 * The roster is tiny, so this is a single `in` lookup instead of N round trips.
 */
async function attachRoles(
  service: ReturnType<typeof createAdminClient>,
  rows: ProfileRow[],
): Promise<AdminUserSearchResult[]> {
  if (rows.length === 0) return [];

  const { data: admins } = await service
    .from("admin_users")
    .select("user_id, role")
    .is("revoked_at", null)
    .in(
      "user_id",
      rows.map((r) => r.id),
    );

  const roles = new Map((admins ?? []).map((a) => [a.user_id, a.role]));

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    kycStatus: row.kyc_status,
    country: row.country,
    suspendedAt: row.suspended_at,
    suspendedReason: row.suspended_reason,
    createdAt: row.created_at,
    adminRole: roles.get(row.id) ?? null,
  }));
}

export async function suspendUser(
  _prevState: AdminUserActionState,
  formData: FormData,
): Promise<AdminUserActionState> {
  const actor = await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!userId) return { error: "Missing the account." };
  // Mirrors the function's own check. Required because the reason is the only
  // thing that tells the next admin — or a regulator — why this happened.
  if (!reason) return { error: "A suspension reason is required." };

  // Refused here as well as in SQL, so the message is a sentence rather than a
  // raised exception. An admin who suspends their own account locks themselves
  // out of the tool they would need to undo it.
  if (userId === actor.id) return { error: "You cannot suspend your own account." };

  const service = createAdminClient();
  const { error } = await service.rpc("admin_suspend_user", {
    p_user_id: userId,
    p_reason: reason,
    p_suspended_by: actor.id,
  });

  // The function raises for a missing account and for an account that still
  // holds admin access. Both messages are written to be shown.
  if (error) return { error: toRpcError(error, "adminUsers") };

  // admin_suspend_user logs from inside itself — this is the in-app notice,
  // which is a separate thing. The user is told, with the reason: an account
  // that silently stops working produces a support thread whose first message
  // is "my app is broken", and answering that costs more than saying so.
  await service.rpc("admin_send_notification", {
    p_user_id: userId,
    p_title: "Your account has been suspended",
    p_body: `${reason} Please contact support if you think this is a mistake.`,
    p_href: "/support",
    p_created_by: actor.id,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function reinstateUser(
  _prevState: AdminUserActionState,
  formData: FormData,
): Promise<AdminUserActionState> {
  const actor = await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing the account." };

  const service = createAdminClient();
  const { error } = await service.rpc("admin_unsuspend_user", {
    p_user_id: userId,
    p_by: actor.id,
  });

  if (error) return { error: toRpcError(error, "adminUsers") };

  await service.rpc("admin_send_notification", {
    p_user_id: userId,
    p_title: "Your account is active again",
    p_body: "The suspension on your account has been lifted. Everything works as normal.",
    p_href: "/home",
    p_created_by: actor.id,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Superadmin only. Targeted by email for the same reason notification compose
 * is: an admin hand-typing a uuid is a transcription error waiting to happen,
 * and the failure mode here is granting admin to the wrong account.
 */
export async function grantAdminRole(
  _prevState: AdminUserActionState,
  formData: FormData,
): Promise<AdminUserActionState> {
  const actor = await requireAdminUser({ role: "superadmin" });
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "admin");

  if (!email) return { error: "Enter the email of the account to grant." };
  if (role !== "admin" && role !== "superadmin") return { error: "Unknown role." };

  const service = createAdminClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id, suspended_at")
    .eq("email", email)
    .maybeSingle();

  if (!profile) return { error: `No account found for ${email}.` };

  // The reverse of the rule admin_suspend_user enforces. Admin access on a
  // suspended account is a state where the two systems disagree about whether
  // this person is trusted, and whichever one wins, the answer is wrong.
  if (profile.suspended_at) {
    return { error: "That account is suspended. Reinstate it first." };
  }

  const { error } = await service.rpc("admin_grant_role", {
    p_user_id: profile.id,
    p_role: role as AdminRole,
    p_granted_by: actor.id,
  });

  if (error) return { error: toRpcError(error, "adminUsers") };

  // The grant is logged inside admin_grant_role. This tells the person, which
  // matters more than it looks: if they did not expect it, they are the first
  // to know that someone is handing out admin access.
  await service.rpc("admin_send_notification", {
    p_user_id: profile.id,
    p_title: "You've been given admin access",
    p_body:
      "Your account can now open the justpae admin tools. You'll be asked to set up an authenticator app the first time you do.",
    p_href: "/admin",
    p_created_by: actor.id,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function revokeAdminRole(
  _prevState: AdminUserActionState,
  formData: FormData,
): Promise<AdminUserActionState> {
  const actor = await requireAdminUser({ role: "superadmin" });
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing the account." };

  const service = createAdminClient();
  // admin_revoke_role refuses self-revocation itself; this is the readable
  // version of the same refusal.
  if (userId === actor.id) return { error: "You cannot revoke your own admin access." };

  const { error } = await service.rpc("admin_revoke_role", {
    p_user_id: userId,
    p_revoked_by: actor.id,
  });

  if (error) return { error: toRpcError(error, "adminUsers") };

  revalidatePath("/admin/users");
  return { ok: true };
}

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import type { AdminRole } from "@/lib/types/database";

/**
 * Admin access: a database role, plus a second factor.
 *
 * WHAT THIS REPLACED. Admin used to be nothing but an email allowlist in
 * ADMIN_EMAILS. That held up while the only admin surface was a gated page,
 * and it was never the sole defence — every admin_* Postgres function is
 * revoked from `anon` and `authenticated` and reachable only through the
 * service-role client. But it meant granting or removing an admin needed a
 * redeploy (minutes, in exactly the incident where seconds matter), there was
 * no record of who granted what to whom, and every admin was identical, so
 * one compromised account was the whole system.
 *
 * ADMIN_EMAILS SURVIVES AS A BOOTSTRAP, nothing more. A fresh project needs a
 * first admin and the alternative is hand-writing a row in the dashboard's SQL
 * editor — both the thing the migrations README forbids and an unlogged change
 * of precisely the kind the ledger exists to end. The bootstrap fires at most
 * once per account, grants 'superadmin' (whoever holds the deploy environment
 * can already change anything; pretending otherwise is theatre), stamps the row
 * `bootstrapped` so the ledger never claims a human did it, and — the part that
 * matters — will NOT resurrect a revoked row. An admin removed through the UI
 * must not come back at their next sign-in because their address is still in an
 * env var somebody forgot to edit.
 *
 * THE SECOND FACTOR IS NOT OPTIONAL. An admin session can approve identity
 * documents, release payouts and suspend accounts, so a stolen password must
 * not be enough. Every gate here demands aal2 — a session that has actually
 * presented a TOTP code, not merely one belonging to a user who owns a
 * factor. See requireAdminUser.
 */

/** Bootstrap allowlist only. Not an access gate — see the module comment. */
function bootstrapAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isBootstrapAdminEmail(email: string | null | undefined): boolean {
  return !!email && bootstrapAdminEmails().includes(email.toLowerCase());
}

/**
 * The role, or null. Resolves the bootstrap on the way through, so the first
 * sign-in by an ADMIN_EMAILS address creates its row and everything after that
 * reads the database.
 *
 * Memoised per request. Rendering any admin page resolved the role at least
 * twice — once in the dashboard layout's isAdmin() to decide whether to show
 * the link at all, and again in the page's own requireAdminUser() — each a
 * service-role RPC. They are the same question asked twice inside one render,
 * which is precisely what cache() is for. Nothing is shared between requests
 * or between users, so a revocation still takes effect on the very next
 * request.
 */
export const adminRoleFor = cache(async function adminRoleFor(
  userId: string,
  email: string | null | undefined,
): Promise<AdminRole | null> {
  const service = createAdminClient();

  const { data: existing, error } = await service.rpc("admin_role_for", { p_user_id: userId });
  if (error) {
    // Fail CLOSED. An unreadable roster is not a reason to let someone in.
    console.error("[admin.adminRoleFor] role lookup failed", { userId, error });
    return null;
  }
  if (existing) return existing;

  if (!isBootstrapAdminEmail(email)) return null;

  const { data: bootstrapped, error: bootstrapError } = await service.rpc("admin_bootstrap_role", {
    p_user_id: userId,
  });
  if (bootstrapError) {
    console.error("[admin.adminRoleFor] bootstrap failed", { userId, error: bootstrapError });
    return null;
  }
  return bootstrapped ?? null;
});

/**
 * Display-only check, for deciding whether to render a link to /admin at all.
 * NOT an access gate — requireAdminUser is.
 */
export async function isAdmin(
  userId: string,
  email: string | null | undefined,
): Promise<boolean> {
  return (await adminRoleFor(userId, email)) !== null;
}

export interface AdminMfaState {
  /** A TOTP factor exists and has been verified. */
  enrolled: boolean;
  /** This session has actually presented a code. */
  aal2: boolean;
}

export async function adminMfaState(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<AdminMfaState> {
  const [{ data: factors }, { data: aal }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  // `totp` on the listFactors response is already filtered to VERIFIED factors.
  // An unverified one is an abandoned enrolment attempt and must not count as
  // a second factor — treating it as one would let someone start an enrolment,
  // never finish it, and be waved through.
  const enrolled = (factors?.totp ?? []).length > 0;

  return { enrolled, aal2: aal?.currentLevel === "aal2" };
}

export interface AdminIdentity {
  id: string;
  email: string;
  role: AdminRole;
}

/**
 * Role only, NO second-factor requirement. Exactly one page may use this:
 * /admin/security, which is where an admin goes TO present or enrol that
 * factor. Gating it on aal2 would make it unreachable by the only people who
 * need it.
 *
 * Everything else — every other page, and every admin action — uses
 * requireAdminUser.
 */
export async function requireAdminRoleOnly(): Promise<AdminIdentity> {
  // getSessionUser() is the authoritative getUser(), memoised for this
  // request — the admin layout and the page under it now share one call
  // instead of making one each.
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const role = await adminRoleFor(user.id, user.email);
  if (!role) redirect("/home");

  return { id: user.id, email: user.email ?? "", role };
}

/**
 * The gate. Call this at the top of every admin page AND every admin server
 * action.
 *
 * The action is the one that actually matters: a server action is reachable by
 * POST whether or not the page that renders its form was gated, so gating only
 * the page leaves the action wide open. That was true of the email allowlist
 * and it is just as true of the role check and the MFA check — a second factor
 * enforced only in the proxy is a second factor enforced nowhere, because the
 * proxy is one matcher edit away from not running.
 *
 * `role: "superadmin"` for the handful of things only a superadmin may do:
 * granting and revoking admin access.
 */
export async function requireAdminUser(options?: {
  role?: AdminRole;
}): Promise<AdminIdentity> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const role = await adminRoleFor(user.id, user.email);
  if (!role) redirect("/home");

  const supabase = await createClient();
  const mfa = await adminMfaState(supabase);
  // Both branches land on the same page, which decides whether to show the
  // enrolment QR or the code prompt. Two routes for one destination would just
  // be two things to keep in step.
  if (!mfa.enrolled || !mfa.aal2) redirect("/admin/security");

  if (options?.role === "superadmin" && role !== "superadmin") redirect("/admin");

  return { id: user.id, email: user.email ?? "", role };
}

/**
 * Writes one entry to the activity ledger. Never throws and never changes the
 * caller's result: the admin action it records has already happened, and a
 * failed log line must not be reported as a failed approval. A persistently
 * broken ledger shows up in the logs instead.
 *
 * It is called from the actions rather than from inside each Postgres function
 * because several admin actions are plain table reads and writes with no
 * function of their own, and an audit trail with holes in it is worse than
 * useless — it is misleading.
 */
export async function logAdminActivity(params: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const service = createAdminClient();
    const { error } = await service.rpc("admin_log_activity", {
      p_admin_id: params.adminId,
      p_action: params.action,
      p_target_type: params.targetType ?? null,
      p_target_id: params.targetId ?? null,
      p_detail: params.detail ?? null,
    });
    if (error) console.error("[admin.logAdminActivity] failed", { ...params, error });
  } catch (err) {
    console.error("[admin.logAdminActivity] threw", {
      action: params.action,
      error: err instanceof Error ? err.message : err,
    });
  }
}

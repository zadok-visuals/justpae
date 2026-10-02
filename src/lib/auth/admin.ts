import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin access is an email allowlist in ADMIN_EMAILS, not a database role.
 *
 * Every admin_* Postgres function is revoked from `anon` and `authenticated`
 * and is only reachable through the service-role client, which never leaves
 * the server. So the gate that matters is this one, in front of the server
 * action that holds that client.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Display-only check, for deciding whether to render a link to /admin at all.
 * NOT an access gate — requireAdminUser is.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

/**
 * Redirects away unless the current session is an allowlisted admin.
 *
 * Call this at the top of every admin page AND every admin server action. The
 * action is the one that actually matters: a server action is reachable by
 * POST whether or not the page that renders its form was gated, so gating only
 * the page leaves the action wide open.
 */
export async function requireAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/home");

  return user;
}

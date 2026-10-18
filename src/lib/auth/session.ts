import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-request auth and profile lookups, fetched once.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE COST THIS REMOVES
 *
 * Rendering /home used to perform three independent `supabase.auth.getUser()`
 * calls — the proxy's, the dashboard layout's, and the page's — and each one
 * is a real HTTPS round trip to the Auth server, not a local read. On top of
 * that the layout read the profile for the suspension banner, the page read
 * the profile again for its own purposes, and both the layout and any admin
 * page resolved the admin role separately.
 *
 * None of that is a caching problem in the usual sense. The data is not stale
 * between those calls; they are the SAME call, made three times, inside one
 * request, because three modules each independently needed the answer and had
 * no way to share it.
 *
 * React's `cache()` is exactly the tool for that: it memoises per request, so
 * the second and third callers get the first one's promise. Nothing is shared
 * between requests, nothing is shared between users, and nothing outlives the
 * render — which is the only acceptable behaviour for an identity lookup.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY getUser() AND NOT getClaims() HERE
 *
 * The proxy uses `getClaims()`, which verifies the session's JWT locally
 * against the project's JWKS — this project signs with ES256, so that needs
 * no network call at all (see src/lib/supabase/proxy.ts).
 *
 * These helpers deliberately do NOT. `getClaims()` gives you what the token
 * asserts; `getUser()` gives you what the Auth server currently says, and the
 * two differ in exactly the cases that matter for money: a token minted
 * before an account was deleted, banned, or had its email changed is still
 * cryptographically valid until it expires. A JWT also cannot answer
 * `email_confirmed_at`, and the one field in it that looks like it can —
 * `user_metadata.email_verified` — is writable by the user through
 * `auth.updateUser()`, so gating anything on it would be gating on a value
 * the attacker supplies.
 *
 * Because this is memoised, the authoritative call costs one round trip for
 * the whole request however many places ask for it. There is no longer a
 * performance argument for using the weaker check in a layout or a page, so
 * none of them do.
 */

/**
 * The signed-in user, verified against the Auth server. Null when signed out.
 * One network call per request no matter how many callers.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * The gate every page and layout under a protected route uses.
 *
 * Both redirects are reachable in normal operation and both are deliberate:
 * no session goes to /login, and a session whose email is not confirmed goes
 * to /auth/verify rather than rendering a dashboard. The proxy performs the
 * first of those too, on the token alone; this is the authoritative repeat,
 * and it is what makes the proxy's cheaper check safe to rely on for routing.
 */
export const requireSessionUser = cache(async (): Promise<User> => {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // No email in the URL — /auth/verify resolves the address from this very
  // session. Carrying it as a query parameter leaked it into history and any
  // referrer for no benefit.
  if (!user.email_confirmed_at) redirect("/auth/verify");
  return user;
});

export interface SessionProfile {
  suspended_at: string | null;
  suspended_reason: string | null;
}

/**
 * The caller's own profile row, under their own RLS — "profiles: read own"
 * already covers it, so no service-role client is involved.
 *
 * Memoised on the user id rather than taken from the ambient session, so a
 * caller that already has an id does not force the session lookup, and two
 * callers asking about the same user share one query.
 */
export const getSessionProfile = cache(
  async (userId: string): Promise<SessionProfile | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("suspended_at, suspended_reason")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[session.getSessionProfile] profile read failed", { userId, error });
      return null;
    }
    return data ?? null;
  },
);

/** The suspension banner's input: null when the account is in good standing. */
export async function getSuspension(
  userId: string,
): Promise<{ at: string; reason: string | null } | null> {
  const profile = await getSessionProfile(userId);
  if (!profile?.suspended_at) return null;
  return { at: profile.suspended_at, reason: profile.suspended_reason };
}

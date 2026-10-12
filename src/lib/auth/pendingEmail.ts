import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Which email is mid-signup-verification, without ever putting it in a URL.
 *
 * Two entry paths land on /auth/verify, and they carry the email two
 * different ways:
 *
 * 1. signUp() or logIn() just ran, no session exists yet (confirmation is
 *    genuinely pending) — the email lives in this short-lived cookie, set
 *    right before the redirect.
 * 2. The proxy redirected an already-signed-in-but-unconfirmed user here
 *    (e.g. "Confirm email" got turned on after they signed up under the old
 *    setting, or they still have the tab open from before). A session
 *    exists, so the email comes straight from it — no cookie was ever set
 *    for this visit, and none needs to be.
 *
 * Session wins when both are available: it's the stronger source of truth,
 * and a stale cookie from an earlier attempt should never shadow it.
 */
const COOKIE_NAME = "jp-pending-email";
// Long enough to read the email, find the code, and type it in; short enough
// that an abandoned signup doesn't leave a lingering cookie.
const COOKIE_MAX_AGE_SECONDS = 15 * 60;

export async function setPendingVerificationEmail(email: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearPendingVerificationEmail() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Resolves the email a verification action should check, per the ordering above. */
export async function resolvePendingVerificationEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) return user.email;

  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

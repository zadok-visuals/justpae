/**
 * Which paths need a session, and which do not — as data, so the proxy and a
 * test can read the same list.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A LIST OF PROTECTED PREFIXES AND NOT JUST "EVERYTHING ELSE"
 *
 * The proxy used to redirect every non-public path to /login. That is the
 * obvious reading of "protect the app", and it has one consequence nobody
 * chose: a URL that does not correspond to any route in this app — a typo, a
 * stale link, a crawler guessing — also redirects to /login and answers 200.
 * Next's own 404 never gets a chance to render, because the redirect happens
 * before the router is ever consulted.
 *
 * Hiding which routes exist buys nothing here. justpae's route names are not
 * secrets: the sidebar and the tab bar advertise every one of them to anyone
 * with an account, and knowing that /convert exists while /qwqwqw does not
 * gets an attacker precisely nowhere — the gate is the session check, not the
 * obscurity of the path. What the old behaviour did cost was real:
 *
 *   - search engines index a confident 200 for every URL that was ever
 *     mistyped into a link;
 *   - a customer who fat-fingers a URL is shown a login form with no hint
 *     that anything is wrong, and (if they are signed in) is bounced to /home
 *     as though they had asked for it;
 *   - the end-to-end suite cannot tell a dead link from a live one, which is
 *     the entire mechanism by which the QA pass finds dead links.
 *
 * So: a path redirects to /login only when it is a route this app actually
 * defines and that route needs a session. Everything else falls through
 * untouched and Next answers 404, exactly as it would for a signed-in user.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE FAILURE MODE THIS LIST HAS, AND THE TEST THAT CLOSES IT
 *
 * An allowlist of protected prefixes fails open: add a new money page and
 * forget to add its prefix here, and the proxy stops gating it. A page's own
 * `requireUser()` still refuses it, so this is never the only lock — but it
 * would be a silent downgrade, which is how the worst version of this bug
 * happens.
 *
 * src/lib/routes/access.test.ts walks src/app and asserts that EVERY page
 * route in the codebase is classified here, as public or protected, with no
 * third category. A new route under (dashboard), /admin or /onboarding that
 * nobody listed fails `npm test` rather than quietly going unguarded.
 */

/**
 * Reachable without a session. Prefix-matched, so "/auth" covers
 * /auth/callback, /auth/confirm and /auth/verify.
 *
 * "/" is handled as an exact match in `isPublicPath` rather than folded in
 * here — startsWith("/") matches every path and would disable auth gating
 * entirely.
 */
export const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth",
  "/forgot-password",
  "/reset-password",
  // The two pages someone reads BEFORE deciding to hand over a government ID.
  // Putting either behind sign-in would defeat the point of publishing them.
  "/privacy",
  "/terms",
] as const;

/**
 * Needs a session. A request for one of these without a user is redirected to
 * /login; a request for anything not listed here and not public is left alone
 * for Next to answer (a real page if one exists, a 404 if not).
 *
 * Matched as a whole path segment: "/accounts" covers /accounts and
 * /accounts/NGN but not /accountsomething.
 */
export const PROTECTED_PREFIXES = [
  "/home",
  "/accounts",
  "/convert",
  "/deposit",
  "/withdraw",
  "/pay-to-china",
  "/receive",
  "/transactions",
  "/bills",
  "/flights",
  "/services",
  "/profile",
  "/support",
  "/admin",
  "/onboarding",
  /**
   * The component gallery. In development it is admitted as public below, so
   * it opens without a Supabase project; outside development it is listed
   * here so an anonymous request still bounces to /login — the page's own
   * notFound() is the other half of a deliberate double gate, and dropping
   * this entry would quietly leave only one.
   */
  "/dev",
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * /dev/* is session-free in development only. Passed in rather than read from
 * process.env so the test can exercise both sides.
 */
export function isPublicPath(pathname: string, isDevelopment = false): boolean {
  if (pathname === "/") return true;
  if (isDevelopment && matchesPrefix(pathname, "/dev")) return true;
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

/** Whether an unauthenticated request for this path should be sent to /login. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

/**
 * Whether a signed-in visitor hitting /login, /signup or / should bounce to
 * /home. `expired` exempts this: it is set only by /auth/signout's redirect,
 * for the instant right after a revoked-but-unexpired session's cookies were
 * cleared, where a stale claim could otherwise read as signed-in and send
 * /login straight back to /home — recreating the loop that redirect exists
 * to end. See src/lib/supabase/proxy.ts and src/lib/auth/signout.ts.
 */
export function shouldBounceToHome(pathname: string, signedIn: boolean, expired: boolean): boolean {
  if (!signedIn || expired) return false;
  return pathname === "/login" || pathname === "/signup" || pathname === "/";
}

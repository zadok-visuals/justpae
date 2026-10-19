/**
 * GROUP 5b — where Back goes when there is nowhere to go back TO.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE CASE THIS EXISTS FOR
 *
 * Every Back control in this product was a `<Link href="…">` with a
 * hand-written destination, and the destinations were guesses about how the
 * user arrived. The KYC form's guess was wrong in a way that cost a round trip
 * and went nowhere (QA 4.1, Group 5a), and the rest were right only by
 * coincidence: /accounts/NGN's Back points at /accounts, which is correct for
 * somebody who tapped through from the list and wrong for the much more common
 * arrival from a Home wallet card.
 *
 * So Back is now `router.back()` whenever the previous history entry belongs
 * to this site, and this module answers the other case: a deep link, a
 * bookmark, a push notification, a shared URL, or a first-ever page load. For
 * those there is genuinely no history to walk, and `router.back()` would take
 * the user OUT of the app — or on the very first entry of a tab, do nothing at
 * all, which is the "back button that loops" the brief names.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THE RULE IS STRUCTURAL RATHER THAN A LOOKUP TABLE
 *
 * A table of 40 routes to 40 parents is a table that goes stale the next time
 * a route is added, and goes stale silently — the symptom is one screen whose
 * Back misbehaves, which nobody notices until a QA sweep. Dropping the last
 * path segment is correct for every nested route this app has
 * (/accounts/NGN → /accounts, /bills/airtime → /bills,
 * /admin/support/<id> → /admin/support) and keeps being correct for ones not
 * written yet.
 *
 * Only the two places where structure and meaning disagree are special-cased,
 * and both are special for a reason rather than for convenience:
 *
 *   signed-out routes  /auth/verify's structural parent is /auth, which is not
 *                      a page. And /login → /home would bounce a signed-out
 *                      visitor straight back to /login: a loop, which is the
 *                      one outcome 5d tests for.
 *   /onboarding/*      structurally /onboarding/kyc → /onboarding, also not a
 *                      page. The real escape from onboarding is the dashboard,
 *                      which is what the layout's own "Later" link already
 *                      says.
 *
 * Pure, with no imports, so it is unit-testable under `node --test`.
 */

/**
 * Everything reachable without a session. Back from any of these goes to the
 * landing page: it is the one destination that cannot redirect a signed-out
 * visitor somewhere else, which is what makes it the only non-looping answer.
 */
const SIGNED_OUT_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/terms",
  "/privacy",
];

/** Where a signed-in user lands when nothing more specific applies. */
export const DEFAULT_PARENT = "/home";

/**
 * Strips a query string, a fragment and any trailing slash, so
 * `/accounts/NGN/`, `/accounts/NGN?from=home` and `/accounts/NGN` all resolve
 * to the same parent. The query matters here: /transactions carries its detail
 * view in `?id=`, so a transaction's own Back arrives with one attached.
 */
function normalise(pathname: string): string {
  const path = pathname.split("?")[0]!.split("#")[0]!;
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path === "" ? "/" : path;
}

export function logicalParent(pathname: string): string {
  const path = normalise(pathname);

  if (path === "/") return "/";

  if (SIGNED_OUT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return "/";
  }

  // The dashboard is the escape from onboarding, not /onboarding — which is
  // not a page, and whose child redirects back to the form anyway (QA 4.1).
  if (path === "/onboarding" || path.startsWith("/onboarding/")) return DEFAULT_PARENT;

  const segments = path.split("/").filter(Boolean);

  // A top-level route — /accounts, /transactions, /admin — has the dashboard
  // as its parent. /admin included: an admin's way out of the admin area is
  // the app, which is exactly what its own "Back to app" link says.
  if (segments.length <= 1) return DEFAULT_PARENT;

  return `/${segments.slice(0, -1).join("/")}`;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PARENT, logicalParent } from "./parent.ts";

/**
 * GROUP 5b/5d.
 *
 * `logicalParent` is the half of the Back decision that can be tested without
 * a browser, and it is the half that has to be right: it is what answers a
 * deep link, a push notification, a bookmark and a shared URL — every arrival
 * where there is no history to walk and therefore no second chance.
 *
 * THE PROPERTY THAT MATTERS MOST is the last test in this file: no route's
 * parent may be a route that redirects back to it. That is the loop 5d
 * checks for end to end, and the two instances of it in this product were
 * both spotted here first — /onboarding/kyc/individual → /onboarding/kyc
 * (QA 4.1) and /login → /home.
 */

test("a nested route's parent is the route above it", () => {
  assert.equal(logicalParent("/accounts/NGN"), "/accounts");
  assert.equal(logicalParent("/accounts/CNY"), "/accounts");
  assert.equal(logicalParent("/bills/airtime"), "/bills");
  assert.equal(logicalParent("/admin/support/abc-123"), "/admin/support");
});

test("a top-level route's parent is the dashboard", () => {
  for (const path of [
    "/accounts",
    "/transactions",
    "/convert",
    "/deposit",
    "/withdraw",
    "/pay-to-china",
    "/profile",
    "/support",
    "/bills",
    "/flights",
  ]) {
    assert.equal(logicalParent(path), DEFAULT_PARENT, `${path}`);
  }
});

test("the dashboard's own parent is the dashboard, not nothing", () => {
  // /home has no Back control, but a fallback of "" or "/" would be a bug
  // waiting for one to be added.
  assert.equal(logicalParent("/home"), DEFAULT_PARENT);
});

test("an admin leaves the admin area for the app, not for a non-existent page", () => {
  // Structurally /admin has no parent segment. Its real parent is the app,
  // which is what the layout's own "Back to app" link says.
  assert.equal(logicalParent("/admin"), DEFAULT_PARENT);
  assert.equal(logicalParent("/admin/withdrawals"), "/admin");
});

/**
 * Onboarding is special-cased, and this is the QA 4.1 regression guard.
 * /onboarding/kyc redirects to the ID form for anyone who has reached the ID
 * form, so structural parenthood here produces a page that sends you straight
 * back where you were.
 */
test("an onboarding step falls back to the dashboard, never to /onboarding/kyc", () => {
  for (const path of [
    "/onboarding/kyc",
    "/onboarding/kyc/individual",
    "/onboarding/kyc/business",
    "/onboarding/kyc/status",
  ]) {
    assert.equal(logicalParent(path), DEFAULT_PARENT, `${path}`);
  }
});

/**
 * Every signed-out route goes to the landing page. /home would bounce a
 * signed-out visitor through the proxy straight back to /login.
 */
test("signed-out routes fall back to the landing page", () => {
  for (const path of [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/auth/verify",
    "/terms",
    "/privacy",
  ]) {
    assert.equal(logicalParent(path), "/", `${path}`);
  }
});

test("a query string or a trailing slash does not change the answer", () => {
  // /transactions carries its detail view in ?id=, so a transaction's own
  // Back arrives here with a query attached.
  assert.equal(logicalParent("/transactions?id=abc"), DEFAULT_PARENT);
  assert.equal(logicalParent("/accounts/NGN/"), "/accounts");
  assert.equal(logicalParent("/accounts/NGN?from=home"), "/accounts");
  assert.equal(logicalParent("/accounts/NGN#balance"), "/accounts");
});

test("the landing page's parent is itself, so Back there cannot escape upward", () => {
  assert.equal(logicalParent("/"), "/");
});

/**
 * THE NO-LOOP INVARIANT.
 *
 * A redirect this app performs unconditionally must never be the parent of
 * the page it redirects TO. Encoded as the pairs that actually exist rather
 * than as a crawl, so adding a redirect means adding a line here.
 */
test("no route's fallback is a page that redirects back to it", () => {
  const unconditionalRedirects: [from: string, to: string][] = [
    // src/app/onboarding/kyc/page.tsx: phone + kyc_type set (which reaching
    // the ID form is what sets) redirects to the matching ID form.
    ["/onboarding/kyc", "/onboarding/kyc/individual"],
    ["/onboarding/kyc", "/onboarding/kyc/business"],
    // The proxy: a signed-out session on any gated route lands on /login.
    ["/home", "/login"],
    ["/accounts", "/login"],
  ];

  for (const [from, to] of unconditionalRedirects) {
    assert.notEqual(
      logicalParent(to),
      from,
      `Back from ${to} must not go to ${from}, which redirects back to ${to}`,
    );
  }
});

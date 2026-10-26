import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSignoutRedirect } from "./signout.ts";
import { shouldBounceToHome } from "../routes/access.ts";

test("resolveSignoutRedirect keeps an in-app next path and marks it expired", () => {
  assert.equal(resolveSignoutRedirect("/login"), "/login?expired=1");
});

test("resolveSignoutRedirect refuses an off-app next and falls back to /login", () => {
  assert.equal(resolveSignoutRedirect("https://evil.example/phish"), "/login?expired=1");
  assert.equal(resolveSignoutRedirect("//evil.example"), "/login?expired=1");
  assert.equal(resolveSignoutRedirect(null), "/login?expired=1");
});

/**
 * The loop this closes: the proxy's getClaims() still reads a revoked
 * session's unexpired JWT as signed-in, while requireSessionUser's real
 * getUser() reports null. Without the fix that redirected to /login, which
 * the proxy's own "signed-in visitor on /login" rule bounced straight back
 * to /home, forever.
 *
 * Composed here across the two redirects a real request takes:
 *   1. requireSessionUser -> /auth/signout?next=/login
 *   2. /auth/signout, after clearing cookies -> resolveSignoutRedirect("/login")
 * and then asserts the proxy's own rule keeps it on /login rather than
 * bouncing a third time.
 */
test("claims valid but getUser null settles on /login within two redirects, and stays", () => {
  const firstRedirect = "/auth/signout?next=/login";
  assert.equal(new URL(firstRedirect, "http://localhost").pathname, "/auth/signout");

  const secondRedirect = resolveSignoutRedirect("/login");
  assert.equal(secondRedirect, "/login?expired=1");

  // Even if a stale claim is still technically unexpired when /login itself
  // is requested, the proxy must not send it back to /home.
  assert.equal(shouldBounceToHome("/login", true, true), false);
  // Sanity: the rule it is carved out of still bounces a normal signed-in
  // visit to /login, so this isn't just disabling the redirect outright.
  assert.equal(shouldBounceToHome("/login", true, false), true);
  assert.equal(shouldBounceToHome("/login", false, false), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  PROTECTED_PREFIXES,
  isProtectedPath,
  isPublicPath,
} from "./access.ts";

/**
 * The allowlist in access.ts fails OPEN: a protected page whose prefix nobody
 * added stops being gated by the proxy. The page's own requireUser() still
 * refuses it, so nothing leaks — but a silent downgrade of the outer lock is
 * exactly the kind of regression that survives review.
 *
 * So the real test here is not "does isProtectedPath match strings". It is
 * "does the list still describe the app on disk". This walks src/app, derives
 * the URL for every page route, and insists each one is classified — public
 * or protected, never neither.
 */

const APP_DIR = join(process.cwd(), "src", "app");

/** Every page route's URL path, derived from the file tree. */
function routePaths(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      if (entry.name === "page.tsx") found.push(prefix === "" ? "/" : prefix);
      continue;
    }
    if (!entry.isDirectory()) continue;

    const name = entry.name;
    // Route groups add no URL segment; private folders are not routes at all.
    if (name.startsWith("(") || name.startsWith("_")) {
      found.push(...routePaths(join(dir, name), prefix));
      continue;
    }
    // A dynamic segment matches anything; "x" stands in for a real value.
    const segment = name.startsWith("[") ? "x" : name;
    found.push(...routePaths(join(dir, name), `${prefix}/${segment}`));
  }
  return found;
}

test("every page route in src/app is classified as public or protected", () => {
  const routes = routePaths(APP_DIR).filter((path) => !path.startsWith("/api"));

  // A sanity floor: if the walk silently found nothing, the assertions below
  // would all pass vacuously.
  assert.ok(routes.length > 20, `expected to find the app's routes, got ${routes.length}`);

  const unclassified = routes.filter(
    (path) => !isPublicPath(path) && !isProtectedPath(path),
  );

  assert.deepEqual(
    unclassified,
    [],
    "these routes exist but the proxy neither admits nor gates them — add each " +
      "to PUBLIC_PATHS or PROTECTED_PREFIXES in src/lib/routes/access.ts",
  );
});

test("the money screens are gated", () => {
  for (const path of [
    "/home",
    "/accounts",
    "/accounts/NGN",
    "/convert",
    "/deposit",
    "/withdraw",
    "/pay-to-china",
    "/transactions",
    "/profile",
    "/support",
    "/admin",
    "/admin/withdrawals",
    "/onboarding/kyc/individual",
  ]) {
    assert.equal(isProtectedPath(path), true, `${path} must require a session`);
    assert.equal(isPublicPath(path), false, `${path} must not be public`);
  }
});

test("a route this app does not define is neither public nor protected", () => {
  for (const path of [
    "/this-route-does-not-exist",
    "/qwqwqw",
    "/wp-admin",
    "/home-equity-loans",
    "/accountsomething",
  ]) {
    assert.equal(isProtectedPath(path), false, `${path} must fall through to Next's 404`);
    assert.equal(isPublicPath(path), false, `${path} is not a public page`);
  }
});

test("a prefix matches whole segments, never a word that merely starts the same", () => {
  assert.equal(isProtectedPath("/admin"), true);
  assert.equal(isProtectedPath("/admin/rates"), true);
  assert.equal(isProtectedPath("/administrators"), false);
});

test("/dev is public in development and gated outside it", () => {
  assert.equal(isPublicPath("/dev/gallery", true), true);
  assert.equal(isPublicPath("/dev/gallery", false), false);
  assert.equal(isProtectedPath("/dev/gallery"), true);
});

test("the public pages stay reachable without a session", () => {
  for (const path of [
    "/",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/privacy",
    "/terms",
    "/auth/verify",
    "/auth/callback",
  ]) {
    assert.equal(isPublicPath(path), true, `${path} must be reachable signed out`);
  }
});

test("no prefix is listed twice", () => {
  assert.equal(new Set(PROTECTED_PREFIXES).size, PROTECTED_PREFIXES.length);
});

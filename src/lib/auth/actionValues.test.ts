import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loginFailureValues, signupFailureValues } from "./actionValues.ts";

/**
 * Group 3c: the login action returns the email on failure, and no action ever
 * returns a password.
 *
 * These test the real helpers — logIn and signUp call exactly these — rather
 * than a copy of the rule. The server actions themselves cannot be imported
 * here: they are "use server" modules pulling in next/navigation and the
 * Supabase server client, which need a request scope node:test cannot
 * provide. Hence the split, and hence the source-level test at the bottom,
 * which is the half that notices if someone stops using the helpers.
 */

test("a failed sign-in hands the email back", () => {
  assert.deepEqual(loginFailureValues("someone@example.com"), {
    email: "someone@example.com",
  });
});

test("a failed sign-in cannot hand a password back", () => {
  const values = loginFailureValues("someone@example.com");

  // The signature takes one string, so there is no password to leak — this
  // asserts the shape that makes that true, which is the thing a later edit
  // would break.
  assert.deepEqual(Object.keys(values), ["email"]);
});

test("an empty email is echoed as empty rather than omitted", () => {
  // The "Email and password are required" path returns values too, so the
  // field is explicitly set to "" rather than left to whatever React had.
  assert.deepEqual(loginFailureValues(""), { email: "" });
});

test("a failed signup hands back every field except the password", () => {
  const values = signupFailureValues({
    email: "someone@example.com",
    fullName: "Ada Lovelace",
    country: "NG",
  });

  assert.deepEqual(values, {
    email: "someone@example.com",
    fullName: "Ada Lovelace",
    country: "NG",
  });
  assert.ok(!("password" in values));
});

test("no auth echo carries a secret, whatever it gets called", () => {
  const source = readFileSync(new URL("./actionValues.ts", import.meta.url), "utf8");

  // Catches a field added to LoginEcho or SignupEcho later. The runtime tests
  // above would keep passing while a password quietly rode along in the RSC
  // payload, so the type declarations are checked directly.
  assert.ok(
    !/^\s*(password|confirmPassword|pin|secret|token)\??:/m.test(source),
    "an auth echo type gained a field that could carry a secret",
  );
});

test("the login and signup actions build their echo from these helpers", () => {
  const source = readFileSync(new URL("../actions/auth.ts", import.meta.url), "utf8");

  // Without this, the helpers could be correct and unused — the tests above
  // would pass against code the actions no longer run.
  assert.match(source, /const values = loginFailureValues\(email\)/);
  assert.match(source, /const values = signupFailureValues\(\{/);

  // And the actions must not hand-roll an echo containing a password.
  assert.ok(
    !/values\s*=\s*\{[^}]*password/.test(source),
    "an auth action built an echo containing a password",
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The invariant that makes the cheaper proxy check safe.
 *
 * The proxy now verifies the session's JWT locally (getClaims) instead of
 * asking the Auth server who the user is on every request. That is a real
 * weakening of the OUTER check, and it is only acceptable because the inner
 * ones did not change: every server action that moves money or alters account
 * data still performs a full `supabase.auth.getUser()` of its own, which is a
 * live round trip the Auth server can refuse for a deleted, banned or
 * signed-out account.
 *
 * A JWT remains cryptographically valid until it expires. If a money action
 * ever stopped doing its own getUser() and leaned on the proxy's claims
 * instead, a revoked session would be able to move money until its token
 * aged out. Nothing in a type system catches that, and nothing in a code
 * review reliably catches its absence either — which is why it is asserted
 * here, mechanically, over the whole directory.
 *
 * This is a source-text assertion rather than a behavioural one on purpose.
 * Executing these modules would need a Supabase client, a request context and
 * a session; what is actually worth defending is the much simpler property
 * that the call is still written in the file.
 */

const ACTIONS_DIR = join(process.cwd(), "src", "lib", "actions");

/**
 * Files whose exports move money, change balances, or alter account state.
 * Not every file in the directory — see the exemptions below, each named
 * rather than pattern-matched so that adding a file is a decision.
 */
const EXEMPT: Record<string, string> = {
  // Sign-up, sign-in and sign-out. These CREATE the session; requiring them
  // to already have one is circular.
  "auth.ts": "establishes the session rather than acting under one",
  // Pure reads for the admin activity ledger view, gated by requireAdminUser
  // (which does its own getUser) at every call site.
  "activity.ts": "read-only, and gated by requireAdminUser",
  // Sets a "don't show the KYC modal again today" cookie. No account or
  // balance data moves, so there is nothing a revoked session could abuse.
  "kycPrompt.ts": "writes only a UI dismissal cookie, no account or money data",
  // GROUP 9. Sets the light/dark/system theme cookie. Same reasoning as
  // kycPrompt.ts: no account, no session, no money — a signed-out visitor
  // on the landing page can set this too.
  "theme.ts": "writes only a UI theme-preference cookie, no account or money data",
  // Which currency Home's total is shown in, and whether amounts are hidden.
  // Same reasoning again: two display cookies, no account or money data.
  "homePrefs.ts": "writes only UI display-preference cookies, no account or money data",
};

function sourceFiles(): string[] {
  return readdirSync(ACTIONS_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .sort();
}

test("every money or account-changing server action does its own full getUser()", () => {
  const files = sourceFiles();
  assert.ok(files.length > 5, `expected the actions directory, found ${files.length} files`);

  const missing: string[] = [];

  for (const name of files) {
    if (name in EXEMPT) continue;
    const source = readFileSync(join(ACTIONS_DIR, name), "utf8");

    // Either the action calls getUser itself, or it delegates to an admin
    // gate that does (requireAdminUser / requireAdminRoleOnly both call
    // getSessionUser, which IS a full getUser — see src/lib/auth/session.ts).
    const verifies =
      source.includes("auth.getUser()") ||
      source.includes("requireAdminUser") ||
      source.includes("requireAdminRoleOnly");

    if (!verifies) missing.push(name);
  }

  assert.deepEqual(
    missing,
    [],
    "these server actions verify no session against the Auth server. The proxy's " +
      "claims check is NOT a substitute: a revoked session keeps a valid JWT until " +
      "it expires. Add a getUser() (or an admin gate that does one), or add the " +
      "file to EXEMPT in this test with the reason.",
  );
});

test("the proxy does not quietly become the only auth check", () => {
  // A direct guard on the reasoning above: if someone "optimises" a money
  // action by reading the proxy's claims instead, this fails.
  for (const name of sourceFiles()) {
    const source = readFileSync(join(ACTIONS_DIR, name), "utf8");
    assert.ok(
      !source.includes("auth.getClaims("),
      `${name} uses getClaims(). Claims describe a token, not a live account — ` +
        "a money action must use getUser().",
    );
  }
});

test("the exemption list stays honest", () => {
  // An exemption for a file that no longer exists is a stale excuse, and the
  // next file to take that name inherits it silently.
  const files = new Set(sourceFiles());
  for (const name of Object.keys(EXEMPT)) {
    assert.ok(files.has(name), `${name} is exempted but does not exist`);
  }
});

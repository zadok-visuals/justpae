/**
 * The six fixture accounts the suite drives, and the one rule they all obey:
 * they are created by the service role, they are marked as fixtures in
 * `user_metadata`, and they are deleted again.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY TEARDOWN SCANS RATHER THAN REMEMBERS
 *
 * The obvious teardown deletes the ids the setup just created. That works
 * right up until the run it matters for: a crashed worker, a killed process,
 * a `--grep` that never reached teardown — and now there are orphaned test
 * accounts in a real database with nothing left holding their ids.
 *
 * So `deleteAllFixtureUsers` finds them instead, by the `e2e: true` marker in
 * user_metadata, and deletes everything it finds. It runs on teardown AND
 * before setup, which means a previous crashed run is cleaned up by the next
 * one rather than accumulating.
 *
 * The marker is the contract. It is set by this file and nothing else sets
 * it, so `e2e: true` on a real customer account is not a thing that can
 * happen by accident — and the email pattern is checked as well, as a second
 * condition rather than the only one, so a single stray metadata write cannot
 * put a real account in scope for deletion.
 *
 * CREDENTIALS. Read from E2E_-prefixed variables, never from the app's own
 * NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Pointing the suite at
 * a database has to be a separate, deliberate act — "I ran the tests and they
 * wiped my dev data" starts with a suite that helpfully picked up whatever
 * connection was lying around.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type FixtureRole =
  | "new"
  | "verified"
  | "kyc_approved"
  | "kyc_rejected"
  | "suspended"
  | "admin";

export type FixtureUser = {
  role: FixtureRole;
  email: string;
  password: string;
  id: string;
};

/** The marker. Nothing else in this codebase writes it. */
const FIXTURE_MARKER = "e2e";
const FIXTURE_EMAIL_PREFIX = "e2e+";
const FIXTURE_EMAIL_DOMAIN = "@justpae.com";

/**
 * Unique per account and per run. A fixed password shared across six accounts
 * in a real database is a credential, not a fixture.
 */
function passwordFor(role: FixtureRole): string {
  const salt = process.env.E2E_RUN_ID ?? String(process.pid);
  return `E2e!${role}-${salt}-Aa1`;
}

export function fixtureEmail(role: FixtureRole): string {
  return `${FIXTURE_EMAIL_PREFIX}${role}${FIXTURE_EMAIL_DOMAIN}`;
}

export function e2eCredentialsPresent(): boolean {
  return !!(process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * The reason the authed project is skipping, or null when it can run. A
 * sentence rather than a boolean, because the one thing worse than a skipped
 * suite is a skipped suite that does not say why.
 */
export function authedSkipReason(): string | null {
  if (e2eCredentialsPresent()) return null;
  if (process.env.E2E_REQUIRE_AUTHED) {
    throw new Error(
      "E2E_REQUIRE_AUTHED is set but E2E_SUPABASE_URL / E2E_SUPABASE_SERVICE_ROLE_KEY are not. " +
        "Refusing to report a pass for tests that never ran.",
    );
  }
  return (
    "needs E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY (a Supabase project the suite " +
    "may create and delete fixture users in). Set E2E_REQUIRE_AUTHED=1 to make this a failure."
  );
}

export function serviceClient(): SupabaseClient {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("serviceClient() called without E2E Supabase credentials. Guard with authedSkipReason().");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isFixtureAccount(user: { email?: string; user_metadata?: Record<string, unknown> }): boolean {
  // BOTH conditions. See the note at the top on why the marker alone is not
  // enough to authorise a delete.
  const markedFixture = user.user_metadata?.[FIXTURE_MARKER] === true;
  const email = user.email ?? "";
  const matchesPattern = email.startsWith(FIXTURE_EMAIL_PREFIX) && email.endsWith(FIXTURE_EMAIL_DOMAIN);
  return markedFixture && matchesPattern;
}

/** Every fixture account currently in the project, however it got there. */
async function listFixtureUsers(admin: SupabaseClient): Promise<{ id: string; email: string }[]> {
  const found: { id: string; email: string }[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    for (const user of users) {
      if (isFixtureAccount(user)) found.push({ id: user.id, email: user.email ?? "" });
    }
    if (users.length < 200) break;
  }
  return found;
}

/**
 * Deletes every fixture account. Idempotent, and safe to call when there are
 * none. Returns what it removed so the teardown can say so out loud — a
 * teardown that claims success silently is one nobody notices has stopped
 * working.
 */
export async function deleteAllFixtureUsers(): Promise<string[]> {
  if (!e2eCredentialsPresent()) return [];
  const admin = serviceClient();
  const fixtures = await listFixtureUsers(admin);
  const removed: string[] = [];
  for (const user of fixtures) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      // Reported, not thrown. One undeletable account must not stop the other
      // five from being cleaned up.
      console.error(`[e2e teardown] could not delete ${user.email}: ${error.message}`);
      continue;
    }
    removed.push(user.email);
  }
  return removed;
}

/** Per-role profile shaping, applied after the auth user exists. */
async function shapeProfile(admin: SupabaseClient, user: FixtureUser): Promise<void> {
  const base = {
    full_name: `E2E ${user.role}`,
    country: "NG" as const,
    phone: "+2348000000000",
  };

  switch (user.role) {
    case "new":
      // Deliberately bare: no name, no phone, no country. This account exists
      // to walk onboarding, and pre-filling it would skip the thing it tests.
      break;

    case "verified":
      await admin.from("profiles").update(base).eq("id", user.id);
      break;

    case "kyc_approved":
      await admin
        .from("profiles")
        .update({ ...base, kyc_type: "individual", kyc_status: "approved" })
        .eq("id", user.id);
      break;

    case "kyc_rejected":
      await admin
        .from("profiles")
        .update({
          ...base,
          kyc_type: "individual",
          kyc_status: "rejected",
          kyc_rejection_reason: "E2E fixture: the document photo was unreadable.",
        })
        .eq("id", user.id);
      break;

    case "suspended":
      await admin
        .from("profiles")
        .update({
          ...base,
          kyc_type: "individual",
          kyc_status: "approved",
          suspended_at: new Date().toISOString(),
          suspended_reason: "E2E fixture",
        })
        .eq("id", user.id);
      break;

    case "admin":
      await admin
        .from("profiles")
        .update({ ...base, kyc_type: "individual", kyc_status: "approved" })
        .eq("id", user.id);
      // admin_users has no RLS policy and no grants — the service role is the
      // only way in, which is exactly the point of using it here.
      await admin
        .from("admin_users")
        .upsert({ user_id: user.id, role: "admin", bootstrapped: false }, { onConflict: "user_id" });
      break;
  }
}

/**
 * Creates one fixture account, replacing any leftover of the same email.
 * email_confirm: true because the suite is not testing Supabase's mail
 * delivery, and a fixture that cannot log in tests nothing at all.
 */
export async function createFixtureUser(role: FixtureRole): Promise<FixtureUser> {
  const admin = serviceClient();
  const email = fixtureEmail(role);
  const password = passwordFor(role);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      [FIXTURE_MARKER]: true,
      e2e_role: role,
      e2e_created_at: new Date().toISOString(),
    },
  });

  if (error || !data?.user) {
    throw new Error(`Could not create fixture user ${email}: ${error?.message ?? "no user returned"}`);
  }

  const user: FixtureUser = { role, email, password, id: data.user.id };
  await shapeProfile(admin, user);
  return user;
}

export const ALL_FIXTURE_ROLES: FixtureRole[] = [
  "new",
  "verified",
  "kyc_approved",
  "kyc_rejected",
  "suspended",
  "admin",
];

/** Fresh accounts for a run, after clearing anything a previous run left. */
export async function createAllFixtureUsers(): Promise<Record<FixtureRole, FixtureUser>> {
  await deleteAllFixtureUsers();
  const entries = await Promise.all(
    ALL_FIXTURE_ROLES.map(async (role) => [role, await createFixtureUser(role)] as const),
  );
  return Object.fromEntries(entries) as Record<FixtureRole, FixtureUser>;
}

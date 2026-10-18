import { deleteAllFixtureUsers, e2eCredentialsPresent } from "./fixtures/users";

/**
 * Runs once after the whole suite, pass or fail.
 *
 * Playwright runs globalTeardown even when tests failed, which is the case
 * that matters: a run that blew up halfway is exactly the run most likely to
 * leave accounts behind.
 *
 * It cannot catch a hard kill (SIGKILL, a closed laptop). That is why
 * createAllFixtureUsers also clears before it creates — see the note in
 * fixtures/users.ts.
 */
export default async function globalTeardown(): Promise<void> {
  if (!e2eCredentialsPresent()) return;

  const removed = await deleteAllFixtureUsers();
  console.error(
    removed.length > 0
      ? `[e2e teardown] removed ${removed.length} fixture account(s): ${removed.join(", ")}`
      : "[e2e teardown] no fixture accounts to remove",
  );
}

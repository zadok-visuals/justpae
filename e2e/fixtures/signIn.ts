import type { Page } from "@playwright/test";
import type { FixtureUser } from "./users";

/**
 * Signs in through the real login form.
 *
 * Not by injecting a session cookie, which would be faster and would skip the
 * proxy, the auth callback and the session cookie handling — three of the
 * things most likely to break and the hardest to notice when they do. The
 * login form is on the critical path for every user; making every test walk
 * it means it can never silently rot.
 */
export async function signIn(page: Page, user: FixtureUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  // Anywhere but /login. A new account lands on onboarding, a verified one on
  // /home — asserting a specific destination here would make this helper
  // encode routing rules that belong in the tests that care about them.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

/**
 * Signs out through the real control, INCLUDING ITS CONFIRMATION.
 *
 * The first version of this helper clicked the sign-out button and waited for
 * a navigation. That was correct when it was written and silently stopped
 * being correct the moment sign-out grew a confirmation dialog
 * (SignOutForm in DashboardChrome.tsx calls preventDefault() and opens a
 * ConfirmDialog instead of submitting). The click then opened a dialog, no
 * navigation ever happened, and every test that ended with signOut() sat in
 * the 20-second waitForURL before failing — which is how four otherwise
 * healthy tests failed for one reason that had nothing to do with them.
 *
 * It was never caught because this project had never been RUN: without
 * E2E_SUPABASE_URL the whole file skips, and a skip is not a pass.
 *
 * So: click the trigger, then confirm if a dialog appears. The `if` is not
 * defensive padding — the mobile layout and the desktop sidebar do not both
 * carry the confirmation, and a helper that demands one would break the other.
 */
export async function signOut(page: Page): Promise<void> {
  await page.goto("/profile");

  const trigger = page.getByRole("button", { name: /sign out|log out/i }).first();
  if (await trigger.count()) {
    await trigger.click();

    // The confirmation, when there is one. `dialog` is the real element —
    // ConfirmDialog renders through Modal, which uses <dialog>.
    const dialog = page.locator("dialog[open]");
    if (await dialog.count()) {
      await dialog.getByRole("button", { name: /^sign out$/i }).click();
    }

    await page.waitForURL(/\/(login)?$/, { timeout: 20_000 });
  }

  await page.context().clearCookies();
}

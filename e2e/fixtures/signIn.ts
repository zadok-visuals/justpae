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

export async function signOut(page: Page): Promise<void> {
  await page.goto("/profile");
  const button = page.getByRole("button", { name: /sign out|log out/i });
  if (await button.count()) {
    await button.first().click();
    await page.waitForURL(/\/(login)?$/, { timeout: 20_000 });
  }
  await page.context().clearCookies();
}

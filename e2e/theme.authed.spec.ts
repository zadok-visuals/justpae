import { expect, test } from "@playwright/test";
import {
  authedSkipReason,
  createAllFixtureUsers,
  deleteAllFixtureUsers,
  type FixtureRole,
  type FixtureUser,
} from "./fixtures/users";
import { signIn } from "./fixtures/signIn";

/**
 * The theme has to change on the click. It used to change only on the next
 * full load — ThemeToggle wrote the cookie and nothing else, and the init
 * script in layout.tsx was the only code that ever applied a theme.
 *
 * So both halves are asserted WITHOUT a reload: the attribute the CSS keys
 * off, and a colour actually painted from it.
 */

const skip = authedSkipReason();
test.skip(skip !== null, skip ?? "");

let users: Record<FixtureRole, FixtureUser>;

test.beforeAll(async () => {
  users = await createAllFixtureUsers();
});

test.afterAll(async () => {
  await deleteAllFixtureUsers();
});

function bodyBackground(page: import("@playwright/test").Page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

test("picking a theme repaints the page with no reload", async ({ page }) => {
  await signIn(page, users.verified);
  await page.goto("/profile");

  const html = page.locator("html");
  const group = page.getByRole("radiogroup", { name: /theme/i });

  // A reload would make this test pass for the wrong reason, so prove none
  // happened: a value put on `window` survives client navigation and state
  // updates, and does not survive a document load.
  await page.evaluate(() => {
    (window as unknown as { __jpThemeProbe?: number }).__jpThemeProbe = 1;
  });

  await group.getByRole("radio", { name: /^dark$/i }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const dark = await bodyBackground(page);

  await group.getByRole("radio", { name: /^light$/i }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  const light = await bodyBackground(page);

  expect(dark).not.toEqual(light);

  const probe = await page.evaluate(
    () => (window as unknown as { __jpThemeProbe?: number }).__jpThemeProbe,
  );
  expect(probe, "the page reloaded — the theme was not applied client-side").toBe(1);
});

test("system removes the attribute rather than freezing a colour", async ({ page }) => {
  await signIn(page, users.verified);
  await page.goto("/profile");

  const group = page.getByRole("radiogroup", { name: /theme/i });
  await group.getByRole("radio", { name: /^dark$/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await group.getByRole("radio", { name: /^system$/i }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
});

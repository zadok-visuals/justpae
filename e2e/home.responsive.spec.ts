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
 * Home's rebuilt layout, at every viewport the sweep runs.
 *
 * The rule the redesign is built on is that everything except the wallet
 * rail is visible without a sideways scroll — so the two rows that USED to
 * scroll (the action tiles and the service tiles) are the two things
 * measured here, as geometry rather than by eye.
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

test.beforeEach(async ({ page }) => {
  await signIn(page, users.verified);
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
});

test("the four money actions are all on screen and the same size", async ({ page }) => {
  const links = page.getByRole("navigation", { name: /money actions/i }).getByRole("link");
  await expect(links).toHaveCount(4);

  const viewport = page.viewportSize();
  const boxes = await links.all();
  const widths = new Set<number>();

  for (const link of boxes) {
    const box = await link.boundingBox();
    expect(box, "an action tile has no box").not.toBeNull();
    widths.add(Math.round(box!.width));
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  }

  expect(widths.size, `action tiles differ in width: ${[...widths].join(", ")}`).toBe(1);
});

test("quick services fit without a scroll, and See all opens the full list", async ({ page }) => {
  const card = page.locator("section", { hasText: /quick services/i }).first();
  await expect(card).toBeVisible();

  const overflow = await card.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, "the services grid scrolls sideways").toBeLessThanOrEqual(1);

  await card.getByRole("link", { name: /see all/i }).click();
  await expect(page).toHaveURL(/\/services/);
  await expect(page.getByText(/bills and utilities/i)).toBeVisible();
});

test("the total balance hides and shows without a reload", async ({ page }) => {
  const total = page.locator("section", { hasText: /total balance/i }).first();
  const hide = total.getByRole("button", { name: /hide amounts/i });
  await hide.click();
  await expect(total.getByText("••••••")).toBeVisible();
  await total.getByRole("button", { name: /show amounts/i }).click();
  await expect(total.getByText("••••••")).toHaveCount(0);
});

test("the wallet rail is the only thing that scrolls sideways", async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

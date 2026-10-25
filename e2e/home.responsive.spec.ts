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
 * GROUP 3 — the rule the rebuild is built on is that NOTHING on Home scrolls
 * sideways any more. The wallet rail is gone (it is one row to /accounts now)
 * and so is the action circle row, so the two things measured here are the
 * 2x2 tile grid and the service grid, as geometry rather than by eye.
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

test("the four action tiles are all on screen and the same size", async ({ page }) => {
  const links = page.getByRole("navigation", { name: /money actions/i }).getByRole("link");
  await expect(links).toHaveCount(4);

  const viewport = page.viewportSize();
  const widths = new Set<number>();

  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box, "an action tile has no box").not.toBeNull();
    widths.add(Math.round(box!.width));
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  }

  expect(widths.size, `action tiles differ in width: ${[...widths].join(", ")}`).toBe(1);
});

test("the tiles are a 2x2 grid, not a single column or a single row", async ({ page }) => {
  const links = page.getByRole("navigation", { name: /money actions/i }).getByRole("link");
  const boxes = await Promise.all((await links.all()).map((l) => l.boundingBox()));
  const tops = new Set(boxes.map((b) => Math.round(b!.y)));
  const lefts = new Set(boxes.map((b) => Math.round(b!.x)));
  expect(tops.size, "the tiles are not on two rows").toBe(2);
  expect(lefts.size, "the tiles are not in two columns").toBe(2);
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
  await total.getByRole("button", { name: /hide amounts/i }).click();
  await expect(total.getByLabel("Amount hidden")).toBeVisible();
  await total.getByRole("button", { name: /show amounts/i }).click();
  await expect(total.getByLabel("Amount hidden")).toHaveCount(0);
});

test("Deposit on the balance card reaches the deposit page", async ({ page }) => {
  const total = page.locator("section", { hasText: /total balance/i }).first();
  await total.getByRole("link", { name: /deposit/i }).click();
  await expect(page).toHaveURL(/\/deposit/);
});

test("the wallets row says how many accounts there are and opens /accounts", async ({ page }) => {
  const row = page.getByRole("link", { name: /your wallets/i });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/\d+ accounts?/);
  await row.click();
  await expect(page).toHaveURL(/\/accounts/);
});

test("the banner card links to Pay to China", async ({ page }) => {
  const banner = page.getByRole("link", { name: /pay suppliers in china/i });
  await expect(banner).toBeVisible();
  await banner.click();
  await expect(page).toHaveURL(/\/pay-to-china/);
});

test("nothing on Home scrolls sideways any more", async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the old rate board and wallet rail are gone from Home", async ({ page }) => {
  await expect(page.getByText(/today's rates/i)).toHaveCount(0);
  await expect(page.locator(".snap-rail")).toHaveCount(0);
});

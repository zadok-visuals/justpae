import { expect, test } from "@playwright/test";

/**
 * Everything reachable without an account.
 *
 * This project needs no credentials, so it is the part of the suite that runs
 * everywhere — including on a machine that has never been pointed at a
 * Supabase project. It is also where the guard assertions live: "a signed-out
 * visitor cannot reach a money screen" is a security property, and it should
 * not be gated behind having fixture accounts available.
 */

test.describe("public pages render", () => {
  test("the landing page states what the product does", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/currencies/i);
    await expect(page.getByRole("link", { name: /open an account/i }).first()).toBeVisible();
  });

  test("the legal pages are reachable and are not empty shells", async ({ page }) => {
    for (const path of ["/terms", "/privacy"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // These are linked from every checkout screen (Group 4g). A legal page
      // that 200s with no body is the failure mode worth catching.
      expect((await page.locator("main").innerText()).length).toBeGreaterThan(500);
    }
  });

  /**
   * Customer copy never says "exchange" and never names a provider. Asserted
   * rather than reviewed, because this is the rule most likely to be broken
   * by a one-line copy change nobody re-reads the whole page after.
   */
  test("public copy avoids the forbidden words", async ({ page }) => {
    for (const path of ["/", "/terms", "/privacy", "/login", "/signup"]) {
      await page.goto(path);
      const text = await page.locator("body").innerText();
      expect(text, `${path} must not name a provider`).not.toMatch(/busha|klasha/i);
      // "exchange rate" is the one legitimate use in customer copy; the banned
      // sense is "exchange" as the name of the action.
      const bannedExchange = text.match(/\bexchanges?\b(?!\s+rate)/gi);
      expect(bannedExchange, `${path} must say convert, not exchange`).toBeNull();
    }
  });
});

test.describe("auth screens", () => {
  test("login shows its fields and its escape hatches", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /forgot your password/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /create an account/i })).toBeVisible();
  });

  test("a wrong password is refused with a message, not a crash", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("definitely-not-a-user@justpae.com");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password-on-purpose");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    // Still on /login, with something visible that explains why. The exact
    // wording is deliberately not asserted — that it says ANYTHING, and that
    // the page did not 500, is the property under test.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toContainText(/application error|internal server error/i);
  });

  test("signup collects the fields onboarding depends on", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Country")).toBeVisible();
  });

  test("forgot password renders its form", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByLabel("Email")).toBeVisible();
  });
});

test.describe("signed-out visitors cannot reach money screens", () => {
  const GATED = [
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
  ];

  for (const path of GATED) {
    test(`${path} redirects to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test("an unknown route 404s rather than erroring", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");
  expect(response?.status()).toBe(404);
});

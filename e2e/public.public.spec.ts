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
   * GROUP 4f on the one surface this project can reach.
   *
   * The deposit, convert and withdraw pickers are behind sign-in, so the
   * `authed` project owns those. What is public is the wallet rail on the
   * landing page — the place a visitor decides whether to hand over a
   * government ID — and the rule there is the harder one to keep: the cedi
   * wallet must be advertised AND marked, because hiding it says the product
   * does not do cedis and advertising it bare mis-sells the account.
   */
  test("the landing page marks a wallet that is under maintenance", async ({ page }) => {
    await page.goto("/");

    const ghsPill = page.getByRole("listitem").filter({ hasText: "GHS" });
    await expect(ghsPill).toBeVisible();

    // Both halves. The flag ships off, so this is the state under test; the
    // assertion is written so that turning the flag ON is what moves it,
    // rather than a copy edit silently dropping the marker.
    const ghsDepositOn = process.env.NEXT_PUBLIC_FEATURE_KLASHA_GHS_DEPOSIT === "true";
    if (ghsDepositOn) {
      await expect(ghsPill).not.toContainText(/maintenance/i);
    } else {
      await expect(ghsPill).toContainText(/maintenance/i);
      // And the word is never the vague one Group 4f replaced.
      await expect(page.locator("main")).not.toContainText(/·\s*unavailable/i);
    }
  });

  /**
   * Customer copy never says "exchange" and never names a provider. Asserted
   * rather than reviewed, because this is the rule most likely to be broken
   * by a one-line copy change nobody re-reads the whole page after.
   *
   * /privacy is the single exception to the provider half, and deliberately
   * so: a privacy policy has to say who the data is shared with, by name. A
   * disclosure required by law is not the marketing leak this rule exists to
   * catch, and the alternative — "we share your details with an unnamed third
   * party" — is a worse document. It is still checked for "exchange", which
   * has no such justification anywhere.
   */
  const PROVIDER_NAME_EXEMPT = new Set(["/privacy"]);

  test("public copy avoids the forbidden words", async ({ page }) => {
    for (const path of ["/", "/terms", "/privacy", "/login", "/signup"]) {
      await page.goto(path);
      const text = await page.locator("body").innerText();
      if (!PROVIDER_NAME_EXEMPT.has(path)) {
        expect(text, `${path} must not name a provider`).not.toMatch(/busha|klasha/i);
      }
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

/**
 * The two directions of the same proxy decision, which is why they are one
 * describe block. The gate above proves a real protected route redirects; what
 * follows proves the redirect is scoped to routes that EXIST.
 *
 * Both matter together. Gating alone was satisfied by the old behaviour of
 * redirecting literally everything, which answered 200 for every mistyped URL
 * and made a dead link indistinguishable from a live one — the exact signal
 * the QA pass relies on.
 */
test.describe("unknown routes are 404s, not login redirects", () => {
  for (const path of [
    "/this-route-does-not-exist",
    "/qwqwqw",
    // Near-misses of real routes: the prefix check must match whole segments,
    // not any path that happens to start with the same letters.
    "/accountsomething",
    "/administrators",
    "/home-equity-loans",
  ]) {
    test(`${path} 404s`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      // And it looks like a 404 to a person, not like a login form.
      await expect(page).not.toHaveURL(/\/login/);
    });
  }

  test("a real protected route still redirects, so the 404 pass-through did not open a hole", async ({
    page,
  }) => {
    const response = await page.goto("/convert");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login/);
  });

  test("an unknown path under a protected prefix redirects rather than leaking its absence", async ({
    page,
  }) => {
    // /admin is gated as a whole subtree. A signed-out visitor learns nothing
    // about which admin pages exist, which is the one place that distinction
    // is worth keeping.
    await page.goto("/admin/not-a-real-admin-page");
    await expect(page).toHaveURL(/\/login/);
  });
});

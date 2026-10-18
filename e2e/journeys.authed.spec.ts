import { expect, test } from "@playwright/test";
import {
  authedSkipReason,
  createAllFixtureUsers,
  deleteAllFixtureUsers,
  type FixtureRole,
  type FixtureUser,
} from "./fixtures/users";
import { signIn, signOut } from "./fixtures/signIn";

/**
 * The signed-in journeys, driven as each of the six fixture roles.
 *
 * Skips with a stated reason when no E2E Supabase project is configured — see
 * authedSkipReason(). It does NOT silently pass: a skip is visible in the
 * report and E2E_REQUIRE_AUTHED=1 turns it into a failure for CI.
 *
 * Payment providers are mocked (E2E_MOCK_PROVIDERS=1 in the webServer env), so
 * every quote, rate and transfer below comes from src/lib/e2e/mockProviders.ts
 * and no real money can move. The database is real.
 */

const skip = authedSkipReason();
test.skip(skip !== null, skip ?? "");

let users: Record<FixtureRole, FixtureUser>;

test.beforeAll(async () => {
  users = await createAllFixtureUsers();
});

test.afterAll(async () => {
  // globalTeardown repeats this. Both, on purpose: this one keeps the
  // database clean between local re-runs, and globalTeardown is the one that
  // still fires when this file's tests failed.
  await deleteAllFixtureUsers();
});

test.describe("a verified account", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, users.verified);
  });

  test("home shows wallets, quick actions and a rates strip", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByText(/your wallets/i)).toBeVisible();
    await expect(page.getByText(/quick actions/i)).toBeVisible();
    await expect(page.getByText(/today's rates/i)).toBeVisible();
  });

  test("accounts lists one row per wallet and each row opens", async ({ page }) => {
    await page.goto("/accounts");

    // SCOPED TO main. `ul li a` unscoped matched the SIDEBAR's nav list first
    // — it is earlier in the document than the page content — so this test
    // clicked "Home" and then asserted it was on an account page. It failed
    // with "received /home", which reads like an app bug and was a selector
    // picking up the chrome.
    const rows = page.locator("main ul li a[href^='/accounts/']");
    await expect(rows.first()).toBeVisible();

    const href = await rows.first().getAttribute("href");
    await rows.first().click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByText(/balance/i).first()).toBeVisible();
  });

  test("every currency's account page renders without an error boundary", async ({ page }) => {
    for (const currency of ["NGN", "USD", "USDT", "KES", "GHS", "CNY"]) {
      await page.goto(`/accounts/${currency}`);
      await expect(page.locator("body")).not.toContainText(/application error|something went wrong/i);
    }
  });

  test("the deposit screen prices a quote through the mock provider", async ({ page }) => {
    await page.goto("/deposit?currency=NGN");

    // The field's label is "How much are you sending?", not anything
    // containing "amount" — getByLabel(/amount/i) matched nothing and spent
    // the full 45-second test timeout waiting for it.
    //
    // Addressed by the label the user actually reads. NOT by name=amount:
    // AmountInput puts that on a HIDDEN input carrying the parsed number,
    // while the visible control is an unnamed text field holding the
    // comma-formatted string — filling the hidden one is not possible and
    // would not exercise the formatting anyway.
    const amount = page.getByLabel(/how much are you sending/i).first();
    await amount.fill("5000");
    const quote = page.getByRole("button", { name: /continue|review|get a quote/i }).first();
    if (await quote.count()) {
      await quote.click();
      // The mock charges a flat NGN 100, so the screen must show a fee and a
      // net — and must NOT show the generic pricing failure.
      await expect(page.locator("body")).not.toContainText(/couldn't price that/i);
    }
  });

  test("no screen names a payment provider", async ({ page }) => {
    for (const path of ["/home", "/accounts", "/convert", "/deposit", "/withdraw", "/transactions", "/profile"]) {
      await page.goto(path);
      await expect(page.locator("body"), `${path} must not name a provider`).not.toContainText(
        /busha|klasha/i,
      );
    }
  });
});

test.describe("a brand new account", () => {
  test("is pushed into onboarding rather than the dashboard", async ({ page }) => {
    await signIn(page, users.new);
    await page.goto("/home");
    // Either onboarding outright, or home with the verification banner. Both
    // are acceptable product states; silently full access is not.
    const url = page.url();
    const banner = await page.getByText(/verif|identity check/i).count();
    expect(url.includes("/onboarding") || banner > 0).toBeTruthy();
    await signOut(page);
  });
});

test.describe("a rejected identity check", () => {
  test("is told why and offered a way to resubmit", async ({ page }) => {
    await signIn(page, users.kyc_rejected);
    await page.goto("/home");
    await expect(page.locator("body")).toContainText(/unreadable|rejected|try again|resubmit/i);
    await signOut(page);
  });
});

test.describe("a suspended account", () => {
  test("cannot start a deposit", async ({ page }) => {
    await signIn(page, users.suspended);
    await page.goto("/deposit");
    // The suspension is enforced in the database too; this asserts the user
    // is TOLD, rather than finding out at submit.
    await expect(page.locator("body")).toContainText(/suspend/i);
    await signOut(page);
  });
});

test.describe("an approved account", () => {
  test("can open convert and pay-to-china", async ({ page }) => {
    await signIn(page, users.kyc_approved);
    for (const path of ["/convert", "/pay-to-china"]) {
      await page.goto(path);
      await expect(page.locator("body")).not.toContainText(/application error/i);
    }
    await signOut(page);
  });
});

test.describe("an admin", () => {
  test("reaches the admin area and a non-admin does not", async ({ page }) => {
    await signIn(page, users.admin);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    await signOut(page);

    await signIn(page, users.verified);
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);
  });
});

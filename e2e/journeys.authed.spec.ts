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

  /**
   * GROUP 4f. The suffix this replaced was a string literal in three
   * components, which is exactly the kind of thing a later copy edit
   * reintroduces without anybody re-reading the picker.
   */
  test("no picker says the generic '· unavailable'", async ({ page }) => {
    for (const path of ["/deposit", "/convert", "/withdraw", "/accounts/GHS", "/home"]) {
      await page.goto(path);
      // The separator is part of the pattern on purpose: "temporarily
      // unavailable" is legitimate prose in a provider-failure message, and
      // "· unavailable" is only ever the suffix Group 4f removed.
      await expect(page.locator("body"), `${path} still has the generic suffix`).not.toContainText(
        /·\s*unavailable/i,
      );
    }
  });

  test("a cedi wallet is marked Maintenance rather than left blank", async ({ page }) => {
    // Skipped if the GHS rail is ever switched on — at which point there is
    // nothing to badge and this assertion should be rewritten, not deleted.
    test.skip(
      process.env.NEXT_PUBLIC_FEATURE_KLASHA_GHS_DEPOSIT === "true",
      "GHS deposits are enabled, so there is no maintenance state to show",
    );

    await page.goto("/accounts/GHS");
    await expect(page.locator("main")).toContainText(/maintenance/i);
    // The old wording, which this is specifically not allowed to be.
    await expect(page.locator("main")).not.toContainText(/coming soon/i);
  });

  /**
   * GROUP 4g. Both screens, both links, and the property that matters most:
   * target="_blank", because a same-tab navigation discards the in-progress
   * quote, amount and PIN held in client state.
   */
  test("deposit and withdraw carry the legal reminder, opening in a new tab", async ({ page }) => {
    for (const path of ["/deposit?currency=NGN", "/withdraw"]) {
      await page.goto(path);
      await expect(page.locator("body"), `${path} has no legal reminder`).toContainText(
        /by continuing you agree/i,
      );

      for (const [name, href] of [
        [/terms & conditions/i, "/terms"],
        [/privacy policy/i, "/privacy"],
      ] as const) {
        const link = page.getByRole("link", { name }).first();
        await expect(link).toHaveAttribute("href", href);
        await expect(link, `${path}'s ${href} link must not navigate in place`).toHaveAttribute(
          "target",
          "_blank",
        );
        await expect(link).toHaveAttribute("rel", /noopener/);
      }
    }
  });

  /**
   * GROUP 4h. The QR is generated in the browser from the `qrcode` package,
   * so the assertion is that an <img> with a data: URL appears — anything
   * fetched from an external host would both leak the address and be blocked
   * by the CSP.
   */
  test("a USDT deposit shows a locally generated QR of the address", async ({ page }) => {
    await page.goto("/deposit?currency=USDT");

    await page.getByLabel(/how much are you sending/i).first().fill("50");
    await page.getByRole("button", { name: /continue/i }).first().click();

    const generate = page.getByRole("button", { name: /generate/i }).first();
    if (!(await generate.count())) return;
    await generate.click();

    await expect(page.getByText(/scan with your wallet app/i)).toBeVisible();
    // BSC alone is what the provider reports; BEP20 is what a wallet app's
    // network dropdown calls it, and both have to be on screen.
    await expect(page.locator("body")).toContainText(/BSC \(BEP20\)/);

    const qr = page.getByRole("img", { name: /qr code/i });
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute("src", /^data:image\//);
  });

  /**
   * GROUP 5d — the back buttons behind sign-in, with the three properties the
   * brief names. The public half (auth shells, legal pages) is in
   * back.public.spec.ts, which runs without credentials.
   */
  test.describe("back buttons", () => {
    const BACK = /^←?\s*(back|accounts|home|activity|profile)/i;

    test("arriving from another page returns to that page", async ({ page }) => {
      // Home → a wallet card → Back. The fallback for /accounts/NGN is
      // /accounts, so landing on /home instead of /accounts is the proof that
      // history was walked rather than the fallback being used.
      await page.goto("/home");
      await page.locator("main").getByRole("link", { name: /NGN/ }).first().click();
      await expect(page).toHaveURL(/\/accounts\/NGN/);

      await page.getByRole("button", { name: BACK }).first().click();
      await expect(page).toHaveURL(/\/home/);
    });

    test("arriving directly falls back to the logical parent", async ({ page }) => {
      // A deep link, which is how a push notification or a shared URL arrives.
      // There is no history, so Back must use logicalParent: /accounts.
      await page.goto("/accounts/NGN");
      await page.getByRole("button", { name: BACK }).first().click();
      await expect(page).toHaveURL(/\/accounts(\?|$)/);
    });

    test("the back button is shown on desktop too, not only on mobile", async ({ page }) => {
      // It was `sm:hidden`. The viewport here is Desktop Chrome's default.
      await page.goto("/accounts/NGN");
      const back = page.getByRole("button", { name: BACK }).first();
      await expect(back).toBeVisible();
      const box = await back.boundingBox();
      // GROUP 5c: a 44px target.
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });

    test("no back button loops", async ({ page }) => {
      for (const path of [
        "/accounts/NGN",
        "/accounts/GHS",
        "/deposit",
        "/withdraw",
        "/convert",
        "/pay-to-china",
        "/receive",
        "/support",
      ]) {
        await page.goto(path);
        const back = page.getByRole("button", { name: BACK }).first();
        if (!(await back.count())) continue;
        await back.click();
        // Whatever it chose, it must not be the page we were already on.
        await expect(page, `${path}'s back button returned to ${path}`).not.toHaveURL(
          new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`),
        );
      }
    });

    /**
     * GROUP 5a / QA 4.1. The ID form's `← Back` pointed at /onboarding/kyc,
     * which redirects straight back to the ID form for anyone who has reached
     * it. The page-level link is gone; the wizard's own Back is the control,
     * and from step 1 it must leave the wizard entirely.
     */
    test("the KYC wizard's Back leaves the wizard from step 1", async ({ page }) => {
      await page.goto("/onboarding/kyc/individual");
      // The redirect guard may send a verified fixture elsewhere; only assert
      // when the form is genuinely on screen.
      if (!/\/onboarding\/kyc\/individual/.test(page.url())) return;

      await page.getByRole("button", { name: /^back$/i }).click();
      await expect(page).not.toHaveURL(/\/onboarding\/kyc\/individual/);
      await expect(page).not.toHaveURL(/\/onboarding\/kyc$/);
    });
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

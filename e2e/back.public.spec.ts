import { expect, test } from "@playwright/test";

/**
 * GROUP 5d — every back control reachable without a session.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ITS OWN FILE AND ITS OWN PROJECT
 *
 * The brief asks for three properties per back button:
 *
 *   1. arriving from another page returns there;
 *   2. arriving directly falls back to the logical parent;
 *   3. no back button ever loops.
 *
 * The third is the one worth the file. A looping back button is invisible to
 * a unit test (the loop is a redirect the server performs), invisible to a
 * screenshot, and invisible in review — both instances this product had
 * looked perfectly reasonable in the source. It takes a real browser
 * following a real redirect chain to see it.
 *
 * The auth and legal shells are the back controls that need no credentials,
 * so they live here and actually run everywhere. The PageShell, onboarding
 * and admin back buttons are behind sign-in and are covered in
 * journeys.authed.spec.ts.
 *
 * Property 1 is also what makes these two shells the interesting cases rather
 * than the boring ones: they are the two places where `router.back()` is
 * DELIBERATELY not used, because both are routinely arrived at with a history
 * that would send the user straight back round — a proxy redirect off a gated
 * route for /login, and a `target="_blank"` checkout link for /terms. See the
 * notes in src/app/(auth)/layout.tsx and src/components/legal/LegalPage.tsx.
 */

const AUTH_SCREENS = ["/login", "/signup", "/forgot-password"];

test.describe("the auth screens have a way out", () => {
  for (const path of AUTH_SCREENS) {
    test(`${path} offers a back control that reaches the landing page`, async ({ page }) => {
      await page.goto(path);

      const back = page.getByRole("link", { name: /back to justpae/i });
      await expect(back).toBeVisible();

      await back.click();
      await expect(page).toHaveURL(/\/$/);
      // The landing page, not a redirect back to where we started.
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/currencies/i);
    });
  }

  /**
   * THE LOOP TEST, in the one place the loop was genuinely available.
   *
   * A signed-out visitor asking for /home is redirected to /login by the
   * proxy. If /login's back control were `router.back()`, it would return to
   * /home, be redirected to /login again, and the user would be stuck
   * bouncing between two URLs with Back appearing to do nothing.
   */
  test("back from a login reached by redirect does not bounce back to login", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login/);

    await page.getByRole("link", { name: /back to justpae/i }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page).not.toHaveURL(/\/login/);
    // And pressing it is not a one-time escape that the next click undoes:
    // the landing page must stay put.
    await page.waitForTimeout(300);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("the back control is a real 44px target, not bare text", async ({ page }) => {
    await page.goto("/login");
    const back = page.getByRole("link", { name: /back to justpae/i });
    const box = await back.boundingBox();
    expect(box, "the back control has no box").not.toBeNull();
    // GROUP 5c. 44px is the floor; the assertion is >= 44 rather than == so
    // a larger target is not a failure.
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("the legal pages have a way back", () => {
  for (const path of ["/terms", "/privacy"]) {
    test(`${path} returns to the landing page when opened directly`, async ({ page }) => {
      // Opened directly is the REAL case here, not the contrived one: Group
      // 4g links both of these from every money checkout with
      // target="_blank", so the reader usually arrives in a fresh tab with no
      // history at all.
      await page.goto(path);

      const back = page.getByRole("link", { name: /back to justpae/i });
      await expect(back).toBeVisible();
      await back.click();

      await expect(page).toHaveURL(/\/$/);
      await expect(page).not.toHaveURL(new RegExp(path));
    });

    test(`${path} reached from the landing page still returns there`, async ({ page }) => {
      await page.goto("/");
      await page.locator("footer").getByRole("link", { name: new RegExp(path.slice(1), "i") }).click();
      await expect(page).toHaveURL(new RegExp(path));

      await page.getByRole("link", { name: /back to justpae/i }).click();
      await expect(page).toHaveURL(/\/$/);
    });
  }
});

/**
 * The property that covers the back buttons this project cannot reach: no
 * gated route's login redirect may be reachable in a way that leaves the
 * visitor with no exit at all. Checked by asserting the escape exists on the
 * page the redirect lands on, for every gated route the public suite already
 * knows redirects.
 */
test("every gated route's login redirect lands on a page with an exit", async ({ page }) => {
  for (const path of ["/home", "/accounts/NGN", "/convert", "/withdraw", "/admin"]) {
    await page.goto(path);
    await expect(page, `${path} should redirect to login`).toHaveURL(/\/login/);
    await expect(
      page.getByRole("link", { name: /back to justpae/i }),
      `${path}'s login redirect has no way out`,
    ).toBeVisible();
  }
});

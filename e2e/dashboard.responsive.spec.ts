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
 * GROUP 6a, measured — the signed-in half of the responsive sweep.
 *
 * layout.responsive.spec.ts covers the public pages, which need no
 * credentials and which 6a did not change. Everything 6a DID change is behind
 * sign-in: Home, Accounts, the account pages and the four money forms. So
 * this file exists, runs in the same six viewport projects, and skips with a
 * stated reason when no E2E Supabase project is configured.
 *
 * WHAT IT ASSERTS, and why not screenshots. 6a has three failure modes, and
 * they pull in opposite directions — which is exactly why fixing one by eye
 * tends to introduce another:
 *
 *   1. OVERSIZED EMPTY AREAS. The bug being fixed: a 42rem column in a
 *      1920px window. Asserted as "the widest content block uses a real
 *      fraction of the usable width".
 *   2. STRETCHED LINES. The bug a careless fix introduces: letting a reading
 *      column grow to 1900px. Asserted as a hard cap on paragraph width.
 *   3. OVERFLOW. Asserted on the document, as in the public sweep.
 *
 * The usable width excludes the sidebar, which appears at `sm` and is 240px.
 * Measuring content against the full viewport would report Home as using 55%
 * of a 1280px screen when it is in fact using 72% of what it has, and the
 * difference is entirely chrome.
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

/** The two-column layouts, and the four money forms. */
const SPLIT_PAGES = ["/home", "/accounts", "/accounts/NGN", "/accounts/USDT"];
const MONEY_FORMS = ["/deposit", "/convert", "/withdraw", "/pay-to-china"];

async function horizontalOverflow(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

/** The width the page content actually has: the viewport less any sidebar. */
async function usableWidth(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    return main.getBoundingClientRect().width;
  });
}

async function widestContentBlock(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    let widest = 0;
    for (const el of Array.from(main.querySelectorAll("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) widest = Math.max(widest, rect.width);
    }
    return widest;
  });
}

/**
 * The widest line of running text on the page.
 *
 * Paragraphs only — a table cell or a wallet address is not a line of prose
 * and has its own reasons to be wide.
 */
async function widestParagraph(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    let widest = 0;
    for (const el of Array.from(document.querySelectorAll("main p"))) {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0 && (el.textContent ?? "").trim().length > 60) {
        widest = Math.max(widest, rect.width);
      }
    }
    return widest;
  });
}

test.describe("the dashboard uses the width it has", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, users.verified);
  });

  for (const path of [...SPLIT_PAGES, ...MONEY_FORMS]) {
    test(`${path} does not scroll sideways`, async ({ page }, testInfo) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await horizontalOverflow(page);
      expect(
        overflow,
        `${path} at ${testInfo.project.name} overflows by ${overflow}px`,
      ).toBeLessThanOrEqual(1);
    });
  }

  for (const path of SPLIT_PAGES) {
    test(`${path} is not a narrow ribbon on a wide screen`, async ({ page }, testInfo) => {
      const viewport = page.viewportSize();
      test.skip(!viewport || viewport.width < 1024, "only meaningful once the split turns on");

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const usable = await usableWidth(page);
      const widest = await widestContentBlock(page);
      const ratio = widest / usable;

      // 0.75 rather than 0.5: `main` is already the capped container, so
      // anything inside it that fails this is genuinely stranded rather than
      // merely centred. The pre-6a layout measured well under this at 1440 —
      // a 42rem column inside a 1200px main.
      expect(
        ratio,
        `at ${testInfo.project.name} ${path}'s widest block used ${Math.round(ratio * 100)}% of its ${Math.round(usable)}px container`,
      ).toBeGreaterThan(0.75);
    });
  }

  /**
   * The opposite failure, asserted on every page including the forms: a line
   * of prose must stay readable. 46rem is 736px; the allowance above it is
   * for padding and sub-pixel layout, not for a wider column.
   */
  for (const path of [...SPLIT_PAGES, ...MONEY_FORMS]) {
    test(`${path} does not stretch a line of text`, async ({ page }, testInfo) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const widest = await widestParagraph(page);
      expect(
        widest,
        `at ${testInfo.project.name} ${path} has a ${Math.round(widest)}px line of prose`,
      ).toBeLessThanOrEqual(760);
    });
  }

  /**
   * GROUP 6a, the money forms specifically: the FORM stays a readable width
   * and the summary sits beside it. Asserted structurally — the summary
   * column is visible, and it is to the right of the form rather than under
   * it — because that is the property, and a width alone would pass for a
   * form that had simply been left narrow with empty space beside it.
   */
  for (const path of MONEY_FORMS) {
    test(`${path} puts its summary beside the form`, async ({ page }, testInfo) => {
      const viewport = page.viewportSize();
      test.skip(!viewport || viewport.width < 1024, "the split turns on at 1024");

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const summary = page.locator("main aside").first();
      // A form can legitimately be absent — /withdraw behind a KYC gate, or
      // /pay-to-china with every wallet empty — and in that state there is no
      // summary to place.
      if (!(await summary.count())) return;
      if (!(await summary.isVisible())) return;

      const summaryBox = await summary.boundingBox();
      const formBox = await page.locator("main form").first().boundingBox();
      if (!summaryBox || !formBox) return;

      expect(
        summaryBox.x,
        `at ${testInfo.project.name} ${path}'s summary is below the form, not beside it`,
      ).toBeGreaterThan(formBox.x + formBox.width - 1);
    });
  }
});

/**
 * The admin frame, which 6b replaced wholesale. The fixture admin has no
 * enrolled TOTP factor, so the proxy admits only /admin/security — which is
 * enough for the property that matters here, since the nav is in the layout
 * and renders on every admin page.
 */
test.describe("the admin nav", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, users.admin);
  });

  test("replaces the pill row and never cuts a label off", async ({ page }, testInfo) => {
    await page.goto("/admin/security");
    await page.waitForLoadState("networkidle");

    const overflow = await horizontalOverflow(page);
    expect(overflow, `admin at ${testInfo.project.name} overflows by ${overflow}px`).toBeLessThanOrEqual(1);

    const viewport = page.viewportSize()!;
    const nav = page.getByRole("navigation", { name: "Admin" });

    if (viewport.width >= 1024) {
      // The sidebar, with every group heading present and every label whole.
      await expect(nav).toBeVisible();
      for (const heading of ["Overview", "Queues", "Money", "People", "System"]) {
        await expect(nav.getByText(heading, { exact: true })).toBeVisible();
      }
      // "Acti…" was the symptom. Asserted by the accessible name being the
      // full word, and by the link's own box not being clipped.
      const activity = nav.getByRole("link", { name: "Activity" });
      await expect(activity).toBeVisible();
      const clipped = await activity.evaluate(
        (el) => el.scrollWidth > el.clientWidth + 1,
      );
      expect(clipped, "a sidebar label is truncated").toBe(false);
    } else {
      // Below 1024 the nav lives behind a menu button.
      const menu = page.getByRole("button", { name: /admin menu/i });
      await expect(menu).toBeVisible();
      await menu.click();
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("link", { name: "Activity" })).toBeVisible();
    }

    // "Back to app", at the bottom of whichever of the two is showing.
    await expect(page.getByRole("link", { name: /back to app/i })).toBeVisible();
  });
});

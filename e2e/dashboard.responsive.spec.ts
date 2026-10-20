import { expect, test } from "@playwright/test";
import {
  authedSkipReason,
  createAllFixtureUsers,
  deleteAllFixtureUsers,
  type FixtureRole,
  type FixtureUser,
} from "./fixtures/users";
import { signIn } from "./fixtures/signIn";
import { enrollAdminTotp, challengeAdminTotp } from "./fixtures/adminMfa";
import { ADMIN_PAGES } from "./fixtures/adminPages";

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
 * The admin frame, which 6b replaced wholesale and GROUP 1 fixed the mobile
 * direction and sticky-sidebar height of.
 *
 * Enrols TOTP ONCE, in beforeAll, on a throwaway page/context — not per test,
 * since GoTrue refuses a second factor under the same friendly name once one
 * is verified. Every test below signs in fresh (aal1) and presents a new
 * code from that same secret to reach aal2, which is the normal shape of a
 * returning admin's session, not a special test path.
 */
test.describe("the admin nav", () => {
  let adminTotpSecret: string;

  test.beforeAll(async ({ browser }) => {
    // browser.newContext() does not inherit the project's `use.baseURL` the
    // way the page/context fixtures do — it has to be passed explicitly
    // here, matching playwright.config.ts's own derivation of the same URL.
    const baseURL = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await signIn(page, users.admin);
    adminTotpSecret = await enrollAdminTotp(page);
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, users.admin);
    await challengeAdminTotp(page, adminTotpSecret);
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

  /**
   * GROUP 1a/1c/1d. Every admin page, not only /admin/security — the mobile
   * header's actual bug (`flex` instead of `flex-col` on the shell) could
   * only show up once more than the one aal2-exempt page was reachable.
   */
  for (const path of ADMIN_PAGES) {
    test(`${path} does not scroll sideways`, async ({ page }, testInfo) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await horizontalOverflow(page);
      expect(overflow, `${path} at ${testInfo.project.name} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }

  test("on mobile the menu bar sits above the content, not beside it", async ({ page }) => {
    const viewport = page.viewportSize()!;
    test.skip(viewport.width >= 1024, "the sidebar replaces the bar from 1024 up");

    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const barBox = await page.getByRole("button", { name: /admin menu/i }).boundingBox();
    const mainBox = await page.locator("main").first().boundingBox();
    if (!barBox || !mainBox) throw new Error("menu bar or main content not found");

    // Above, not beside: the bar's bottom edge at or above main's top edge,
    // and the bar spans from the left edge rather than sitting in a column
    // next to a full-height <main> (the `flex` row the fix replaced).
    expect(barBox.y, "the menu bar is not above the page content").toBeLessThan(mainBox.y + 1);
    expect(barBox.x, "the menu bar is offset sideways, not spanning the top").toBeLessThan(16);
  });

  test("on desktop, Back to app stays visible after scrolling to the bottom of a long admin page", async ({
    page,
  }) => {
    const viewport = page.viewportSize()!;
    test.skip(viewport.width < 1024, "the sticky sidebar only applies from 1024 up");

    // /admin/rates stacks five forms plus a table — long regardless of how
    // much data this run's database happens to hold.
    await page.goto("/admin/rates");
    await page.waitForLoadState("networkidle");
    await page.mouse.wheel(0, 100_000);

    await expect(page.getByRole("link", { name: /back to app/i })).toBeInViewport();
  });
});

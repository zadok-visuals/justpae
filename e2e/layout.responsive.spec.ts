import { expect, test } from "@playwright/test";

/**
 * The responsive sweep, run by the four viewport projects in
 * playwright.config.ts: 375, 768, 1280 and 1440.
 *
 * WHAT IT ASSERTS, and why these and not screenshots. Visual snapshots of a
 * design that is still being worked on fail on every intended change and
 * teach everyone to re-baseline without looking. These are the properties
 * that are never intended to change:
 *
 *   - the page does not scroll sideways. A horizontal scrollbar on a phone is
 *     always a bug, and it is the single most common one in this codebase's
 *     history (a wide table, a long reference string, a flex row that will
 *     not wrap).
 *   - no element pushes past the viewport's right edge.
 *   - on a wide screen the content is not stranded in a narrow column — the
 *     Group 6a complaint, asserted so it cannot quietly come back.
 */

const PUBLIC_PATHS = ["/", "/login", "/signup", "/terms", "/privacy"];

async function horizontalOverflow(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

/** The widest element sticking out past the right edge, for a usable failure. */
async function widestOverflowingElement(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    let worst: { tag: string; cls: string; right: number } | null = null;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > limit + 1 && (!worst || rect.right > worst.right)) {
        worst = {
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute("class") ?? "").slice(0, 120),
          right: Math.round(rect.right),
        };
      }
    }
    return worst;
  });
}

for (const path of PUBLIC_PATHS) {
  test(`${path} does not scroll sideways`, async ({ page }, testInfo) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const overflow = await horizontalOverflow(page);
    const worst = await widestOverflowingElement(page);
    expect(
      overflow,
      `${path} at ${testInfo.project.name} overflows by ${overflow}px. Widest offender: ${JSON.stringify(worst)}`,
    ).toBeLessThanOrEqual(1);
  });
}

/**
 * Group 6a, as an assertion. At 1280 and above the landing page's content
 * should actually use the width it has rather than sitting in a phone-width
 * column with empty space either side.
 */
test("wide screens are not left mostly empty", async ({ page }, testInfo) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width < 1280, "only meaningful on a wide screen");

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const used = await page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    let widest = 0;
    for (const el of Array.from(main.querySelectorAll("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) widest = Math.max(widest, rect.width);
    }
    return widest;
  });

  const width = viewport!.width;
  expect(
    used / width,
    `at ${testInfo.project.name} the widest content block used ${Math.round((used / width) * 100)}% of the viewport`,
  ).toBeGreaterThan(0.5);
});

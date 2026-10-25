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
 * A whole individual identity check, submitted.
 *
 * This is the test that would have caught the failure it was written for:
 * every kyc_documents upsert from a user session was rejected for want of an
 * UPDATE privilege on user_id, and the only visible symptom was "Something
 * went wrong. Please try again." — a string no unit test asserts on and no
 * page-level test ever reached.
 *
 * The upload is real: UploadField writes straight to the private bucket from
 * the browser, so this also exercises the storage policy and the server-side
 * ownership re-check.
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

/** A 1x1 PNG. Small enough to be inline, real enough for canvas to decode. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("an individual submits their identity check and lands on the status page", async ({
  page,
}) => {
  await signIn(page, users.verified);
  await page.goto("/onboarding/kyc/individual");

  // The fixture is Nigerian, so the form asks for a BVN/NIN and no ID type.
  await page.getByLabel("Full name").fill("Verified Fixture");
  await page.getByLabel(/bvn|nin|national identity/i).fill("12345678901");

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "id.png",
    mimeType: "image/png",
    buffer: PNG,
  });

  // Continue only unlocks once the upload has actually landed in the bucket.
  const next = page.getByRole("button", { name: /^continue$/i });
  await expect(next).toBeEnabled({ timeout: 30_000 });
  await next.click();

  await page.getByRole("button", { name: /submit for review/i }).click();

  await expect(page).toHaveURL(/\/onboarding\/kyc\/status/, { timeout: 30_000 });
  // The generic message is the bug's signature; assert it is nowhere on screen.
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
});

test("an approved account is not sent back through the form", async ({ page }) => {
  await signIn(page, users.kyc_approved);
  await page.goto("/onboarding/kyc/individual");
  await expect(page).not.toHaveURL(/\/onboarding\/kyc\/individual/);
});

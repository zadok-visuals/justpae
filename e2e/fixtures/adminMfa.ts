import type { Page } from "@playwright/test";
import { totpCode } from "./totp";

/**
 * Drives the real /admin/security screen through first-time TOTP enrolment:
 * reads the secret GoTrue actually issued (from the "Can't scan it?" detail,
 * not a value this file invents), computes a live code from it, and submits.
 * Returns the secret so a LATER session — a fresh sign-in, which is aal1
 * again — can compute its own fresh code and challengeAdminTotp() straight
 * to aal2, without re-enrolling (GoTrue refuses a second factor under the
 * same friendly name once one is verified).
 */
export async function enrollAdminTotp(page: Page): Promise<string> {
  await page.goto("/admin/security");

  await page.getByText(/can.t scan it\?/i).click();
  const secret = await page.evaluate(() => {
    const match = Array.from(document.querySelectorAll("p")).find((p) =>
      /^[A-Z2-7]{16,}$/.test(p.textContent?.trim() ?? ""),
    );
    return match?.textContent?.trim() ?? null;
  });
  if (!secret) throw new Error("Enrolment screen did not show a TOTP secret to read.");

  await page.getByLabel(/code from your app/i).fill(totpCode(secret));
  await page.getByRole("button", { name: /confirm and turn on/i }).click();
  await page.waitForURL(/\/admin$/, { timeout: 15_000 });

  return secret;
}

/** For a session that already holds a verified factor: present a fresh code to reach aal2. */
export async function challengeAdminTotp(page: Page, secret: string): Promise<void> {
  await page.goto("/admin/security");
  await page.getByLabel(/code from your app/i).fill(totpCode(secret));
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/admin$/, { timeout: 15_000 });
}

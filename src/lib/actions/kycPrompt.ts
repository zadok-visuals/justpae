"use server";

import { cookies } from "next/headers";

/**
 * GROUP 4. "Later" on the KYC prompt modal, remembered for a day.
 *
 * A cookie, not a database row: this is "don't ask again today", not an
 * account setting, and it has to be readable on the server BEFORE the modal
 * would render — a client-only dismissal (localStorage, a useEffect) shows
 * the modal for one frame on every load, which is the flash this is written
 * to avoid.
 */
// Not exported: a "use server" file may only export async functions — an
// exported const here breaks every import of this module, client and server
// alike ("the module has no exports at all").
const KYC_PROMPT_COOKIE = "kyc_prompt_dismissed_until";
const DISMISS_HOURS = 24;

export async function dismissKycPrompt(): Promise<void> {
  const store = await cookies();
  store.set(KYC_PROMPT_COOKIE, String(Date.now() + DISMISS_HOURS * 60 * 60 * 1000), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DISMISS_HOURS * 60 * 60,
    path: "/",
  });
}

/** Read server-side, before the modal would otherwise render. */
export async function isKycPromptDismissed(): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(KYC_PROMPT_COOKIE)?.value;
  if (!raw) return false;
  const until = Number(raw);
  return Number.isFinite(until) && Date.now() < until;
}

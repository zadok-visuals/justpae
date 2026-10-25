"use server";

import { cookies } from "next/headers";
import { isThemePreference, THEME_COOKIE, type ThemePreference } from "@/lib/theme";

/**
 * GROUP 9. One cookie, one year, read back by getThemePreference() in the
 * root layout on every request. No account/session needed — a signed-out
 * visitor on the landing page gets the same no-flash theming as a signed-in
 * one, since both go through the same cookie and the same root layout.
 */
export type ThemePreferenceState = { ok?: boolean; error?: string };

export async function setThemePreference(preference: ThemePreference): Promise<ThemePreferenceState> {
  if (!isThemePreference(preference)) return { error: "Not a valid theme." };

  const store = await cookies();
  store.set(THEME_COOKIE, preference, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // No revalidate: ThemeToggle applies the choice to the document itself, so
  // re-rendering the whole tree would only be a round trip that changes
  // nothing. The cookie is what the next full load reads.
  return { ok: true };
}

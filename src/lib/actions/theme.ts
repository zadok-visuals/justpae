"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
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

  // The whole tree re-renders under the new data-theme attribute, not just
  // Profile — a theme choice is global, not a page-local setting.
  revalidatePath("/", "layout");
  return { ok: true };
}

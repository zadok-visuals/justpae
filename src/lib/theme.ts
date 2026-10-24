import { cookies } from "next/headers";

/**
 * GROUP 9. Light is the app's primary theme; dark is a real, finished,
 * optional second theme a user opts into from Profile. "system" means
 * neither — follow the OS, via the @media (prefers-color-scheme) block in
 * globals.css, which is also what a visitor who has never touched the
 * setting gets by not having the cookie at all.
 */
export type ThemePreference = "light" | "dark" | "system";

export const THEME_COOKIE = "jp-theme";

const VALID: readonly ThemePreference[] = ["light", "dark", "system"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (VALID as readonly string[]).includes(value);
}

/**
 * Server-side read of the SAME cookie the root layout's inline script reads
 * client-side (see layout.tsx for why that script, not this function, is
 * what prevents the flash on first paint). Used where a page is already
 * dynamic for an unrelated reason and genuinely needs the resolved value —
 * currently just Profile, to show the toggle's current selection.
 */
export async function getThemePreference(): Promise<ThemePreference> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isThemePreference(value) ? value : "light";
}

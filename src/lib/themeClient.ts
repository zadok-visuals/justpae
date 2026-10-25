import type { ThemePreference } from "./theme.ts";

/**
 * The theme a user picks has to take effect on the click, not on the next
 * full load. Before this, ThemeToggle only wrote the cookie and the page kept
 * its old colours until a refresh — the init script in layout.tsx was the
 * only thing that ever applied one.
 *
 * Pure resolution lives in resolveTheme so it can be tested without a DOM;
 * everything below it is the DOM half, and is also what the inline init
 * script in layout.tsx does before first paint.
 */

/** Kept in step with the --jp-background tokens in globals.css. */
export const THEME_COLORS = { light: "#ffffff", dark: "#0b0d10" } as const;

export const THEME_COLOR_META_MARKER = "data-jp-theme-color";

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): "light" | "dark" {
  if (preference === "light" || preference === "dark") return preference;
  return prefersDark ? "dark" : "light";
}

function prefersDark(): boolean {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

/**
 * One meta tag, inserted first in <head> so it wins over the media-conditional
 * pair Next renders from `viewport.themeColor` — the UA uses the first
 * theme-color whose media matches, and this one has no media.
 */
function setThemeColorMeta(color: string): void {
  let meta = document.querySelector<HTMLMetaElement>(`meta[${THEME_COLOR_META_MARKER}]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.setAttribute(THEME_COLOR_META_MARKER, "");
    document.head.insertBefore(meta, document.head.firstChild);
  }
  meta.content = color;
}

/**
 * "system" deliberately REMOVES data-theme rather than writing the resolved
 * value: the @media (prefers-color-scheme) block in globals.css is what
 * should be in charge then, and an attribute would freeze the choice.
 */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  const resolved = resolveTheme(preference, prefersDark());

  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);

  root.style.colorScheme = resolved;
  setThemeColorMeta(THEME_COLORS[resolved]);
}

/** Live only while "system" is the selection. Returns the unsubscribe. */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

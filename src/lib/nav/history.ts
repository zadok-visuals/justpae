/**
 * GROUP 5b — "is the previous history entry on this site?"
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS CANNOT JUST BE `window.history.length > 1`
 *
 * That is the answer everyone reaches for and it is wrong in both directions.
 * `history.length` counts the whole TAB's session, including entries from
 * other origins — a user who arrived from a Google result has length 2, and
 * `router.back()` sends them to Google. It also never goes down, so a tab that
 * has been around a while reports a long history regardless of whether the
 * previous entry is ours. The failure mode is the worst kind: Back ejects the
 * user from a half-finished money form into a search engine.
 *
 * `document.referrer` is better but only half the story: it describes the
 * document LOAD. A Next App Router soft navigation pushes history without a
 * document load, so after /home → /accounts/NGN the referrer still says
 * whatever loaded /home — which may be a different origin, or nothing at all.
 *
 * So both signals are used, and each covers the other's blind spot:
 *
 *   1. SOFT NAVIGATIONS. NavigationTracker (mounted once in the root layout)
 *      counts every pathname change after the first. One or more means the
 *      previous entry is unambiguously ours, because we are the ones who
 *      pushed it. This is the common case and the reliable one.
 *
 *   2. HARD LOADS. Count zero means this is the first render of this
 *      document — a deep link, a full reload, a server-side redirect. Then
 *      the referrer is exactly the right question, and a same-origin referrer
 *      means the previous entry is a page of ours.
 *
 * Anything else — count zero and a foreign or empty referrer — is treated as
 * NO in-app history, and the caller falls back to logicalParent(). Guessing
 * wrong in that direction costs the user one extra tap. Guessing wrong in the
 * other direction loses their form.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THE COUNTER IS MODULE SCOPE AND NOT STATE OR STORAGE
 *
 * It must be readable from a click handler without re-rendering anything, and
 * it must be scoped to THIS document — which is precisely the lifetime of a
 * module instance in the browser. sessionStorage would outlive the document
 * and start reporting history that a reload has already discarded;
 * React state would need every Back button to subscribe to a provider for a
 * value none of them render.
 */

let softNavigations = 0;

/** Called by NavigationTracker on every pathname change after the first. */
export function recordSoftNavigation(): void {
  softNavigations += 1;
}

/** Test seam, and the reason this is not just a bare `let` export. */
export function softNavigationCount(): number {
  return softNavigations;
}

function referrerIsSameOrigin(): boolean {
  if (typeof document === "undefined" || !document.referrer) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    // A malformed referrer is not something to throw over inside a click
    // handler on a money screen.
    return false;
  }
}

/**
 * True when `router.back()` will land on a page of this app rather than
 * leaving the site or doing nothing.
 */
export function hasInAppHistory(): boolean {
  if (typeof window === "undefined") return false;
  return softNavigations > 0 || referrerIsSameOrigin();
}

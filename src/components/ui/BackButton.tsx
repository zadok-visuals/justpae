"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasInAppHistory } from "@/lib/nav/history";
import { logicalParent } from "@/lib/nav/parent";
import { BACK_BUTTON_CLASS } from "@/lib/ui/escapeControl";

/**
 * GROUP 5b/5c — the only Back control in this product.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT IT REPLACED
 *
 * Six separately written back links, each a `<Link>` to a hard-coded guess
 * about where the user came from:
 *
 *   PageShell          `← {label}`, mobile only (`sm:hidden`)
 *   onboarding KYC     `← Back` → /onboarding/kyc, which redirects straight
 *                      back to the form it was on (QA 4.1 — Group 5a)
 *   admin support      `← All threads`
 *   LegalPage          `← Back to justpae`
 *
 * Four of those were right only when the user had in fact arrived from the
 * guessed page. One was a no-op costing a round trip. None of them appeared
 * on desktop, where the browser's own Back is further from the content than a
 * sidebar is and a 1440px screen has the most room for one.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * HISTORY FIRST, PARENT SECOND
 *
 * `router.back()` when the previous entry is ours, because that is what the
 * user means by Back — the page they were just looking at, not a page
 * somebody guessed they were looking at. `logicalParent()` otherwise, because
 * on a deep link or a cold load there is no previous entry and `back()` would
 * either leave the site or do nothing at all. See src/lib/nav/history.ts for
 * how "is it ours" is decided and why the obvious test is wrong.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * A BUTTON, NOT A LINK, AND WHY THAT IS A DOWNGRADE WORTH TAKING
 *
 * This genuinely cannot be an `<a>`: the destination is not known until the
 * click, since it depends on the session's own history. An `<a href>` pointing
 * at the parent that then calls `back()` in its handler would advertise the
 * wrong URL to a middle-click, a long-press "open in new tab" and a hover
 * status bar. So: a real `<button>`, labelled "Back", in a product where Back
 * is a thing you press rather than a place you go.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 5c: IT HAS TO LOOK LIKE A BUTTON
 *
 * It was muted grey text next to muted grey body copy, which is how a control
 * ends up invisible. It is now the brand blue, 44px tall, with all three
 * states distinct:
 *
 *   hover    the blue deepens and a sidebar-tinted ground appears
 *   active   `scale-95`, so a touch is acknowledged before the navigation
 *            resolves — the one moment a user is deciding whether their tap
 *            registered
 *   focus    the global 2px primary outline (globals.css), left alone rather
 *            than overridden
 *
 * The arrow is `aria-hidden`: a screen reader announcing "left arrow Back"
 * reads the decoration twice.
 */
export function BackButton({
  /**
   * Where to go when there is no in-app history. Optional — omitted, it is
   * derived from the current path by logicalParent(), which is right for
   * every nested route. Pass it only where structure and meaning differ (an
   * onboarding step's exit, say).
   */
  fallbackHref,
  label = "Back",
  className = "",
}: {
  fallbackHref?: string;
  label?: string;
  className?: string;
}) {
  const onClick = useGoBack(fallbackHref);

  return (
    <button type="button" onClick={onClick} className={`${BACK_BUTTON_CLASS} ${className}`}>
      <span aria-hidden="true">←</span>
      {label}
    </button>
  );
}

/**
 * The same decision as a callback, for the places that already have their own
 * button and only need the behaviour — the KYC wizard's step-1 Back (Group
 * 5a), which is a `<Button variant="secondary">` inside a stepped form and
 * must not become a second visual language.
 */
export function useGoBack(fallbackHref?: string): () => void {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(() => {
    if (hasInAppHistory()) {
      router.back();
      return;
    }
    router.push(fallbackHref ?? logicalParent(pathname));
  }, [router, pathname, fallbackHref]);
}

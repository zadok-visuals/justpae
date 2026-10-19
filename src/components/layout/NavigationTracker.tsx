"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { recordSoftNavigation } from "@/lib/nav/history";

/**
 * GROUP 5b — counts in-app navigations so a Back button can tell whether
 * `router.back()` has anywhere of ours to go.
 *
 * MOUNTED ONCE, IN THE ROOT LAYOUT, and that placement is the whole design.
 * The alternative — have each Back button watch the pathname itself — fails
 * for the case that matters: the user navigates Home → Accounts → NGN, and
 * the NGN page's Back button mounted on the LAST of those three, so it
 * observed no navigation at all and would wrongly conclude there is no
 * history. The counter has to be kept by something that outlives every
 * individual page, which is the root layout.
 *
 * Renders nothing. It is a side effect with a component wrapper because
 * `usePathname` is a hook.
 *
 * WHY THE FIRST PATHNAME IS NOT COUNTED. On the initial render there has been
 * no navigation — the effect fires once for the page the user loaded, and
 * counting it would claim an in-app history entry that does not exist, which
 * is exactly the `history.length > 1` bug this module exists to avoid. The
 * ref holds the first value instead of a boolean so a soft navigation back to
 * the SAME path (a refresh via router.refresh(), say) is not miscounted
 * either.
 */
export function NavigationTracker() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (previous.current === null) {
      previous.current = pathname;
      return;
    }
    if (previous.current === pathname) return;
    previous.current = pathname;
    recordSoftNavigation();
  }, [pathname]);

  return null;
}

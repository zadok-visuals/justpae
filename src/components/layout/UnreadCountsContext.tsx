"use client";

import { createContext, useContext } from "react";

/**
 * The two header badge counts, fetched once per request in the dashboard
 * layout and read by whichever chrome is mounted.
 *
 * WHY CONTEXT AND NOT PROPS. TopBar is rendered by the layout, so it could
 * take props — but MobileTopBar is rendered by PageShell, which every single
 * page and every loading.tsx mounts for itself. Threading two counts down to
 * MobileTopBar through props would mean adding them to PageShell's signature
 * and then to roughly thirty call sites, each of which would have to fetch
 * them itself: thirty extra round trips per navigation, to render the same two
 * numbers the layout already has.
 *
 * The layout is the one place that renders exactly once per request and sits
 * above both bars, so it fetches and publishes; both bars subscribe.
 *
 * The default is zeroes rather than a throw, because the chrome is also
 * mounted outside the dashboard layout — /dev/gallery renders TopBar and
 * MobileTopBar directly to check them at 375px and 1440px, with no session
 * and no provider. A context that threw there would make the gallery
 * unopenable; a bell with no badge is exactly right there.
 */
export interface UnreadCounts {
  notifications: number;
  support: number;
}

const ZERO: UnreadCounts = { notifications: 0, support: 0 };

const UnreadCountsContext = createContext<UnreadCounts>(ZERO);

export function UnreadCountsProvider({
  counts,
  children,
}: {
  counts: UnreadCounts;
  children: React.ReactNode;
}) {
  return <UnreadCountsContext.Provider value={counts}>{children}</UnreadCountsContext.Provider>;
}

export function useUnreadCounts(): UnreadCounts {
  return useContext(UnreadCountsContext);
}

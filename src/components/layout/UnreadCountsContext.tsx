"use client";

import { createContext, useContext, useState } from "react";
import { usePolling } from "@/lib/hooks/usePolling";
import { getUnreadCounts, type UnreadCounts } from "@/lib/actions/unread";

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
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GROUP 11b — THE PROVIDER IS NOW THE BADGE POLLER
 *
 * It was a pure pass-through: whatever the layout read on the last server
 * render, held until the next navigation. So a support reply or a new
 * notification arriving while somebody sat on /home was invisible until they
 * happened to move. The thing the badge exists to tell them was the thing it
 * could not tell them.
 *
 * It now refreshes the counts itself, through the shared poller — which means
 * it stops entirely while the tab is hidden and catches up the moment the user
 * comes back, which is the whole point of putting that behaviour in the hook.
 *
 * WHY HERE AND NOT IN THE BARS. There are two bars and they are mounted by
 * different parents; a poller in each would be two timers and two requests per
 * interval for the same two numbers, and on a wide screen where both are
 * mounted they could briefly disagree. The provider is the one component that
 * is mounted exactly once above both.
 *
 * WHY A SERVER ACTION AND NOT router.refresh(). refresh() re-renders the whole
 * server tree — every wallet read, every rate lookup on the page — to update
 * two integers. That is the right tool for LiveRefresh, whose job IS the
 * server render, and the wrong one here by about two orders of magnitude.
 *
 * WHY 60 SECONDS. A badge is an interruption, not a live feed. The two screens
 * where the content itself has to be current — the support thread and the
 * notification list — already poll faster or fetch on open, and this exists so
 * that somebody NOT on those screens finds out there is something to look at.
 * A minute is well inside the time it takes to notice a dot and act on it, and
 * it is slow enough that a tab left open all day is a negligible number of
 * requests.
 *
 * THE SERVER'S VALUE STILL WINS ON NAVIGATION. The prop is compared during
 * render, not in an effect: a fresh server render is at least as current as
 * anything this has polled, and it is the value the rest of the page was
 * rendered against. Resetting to it in an effect would show one frame of the
 * stale polled number after every navigation.
 */
export type { UnreadCounts };

const ZERO: UnreadCounts = { notifications: 0, support: 0 };

const UnreadCountsContext = createContext<UnreadCounts>(ZERO);

/** Seconds between badge refreshes. See the note above for why a minute. */
export const UNREAD_POLL_INTERVAL_MS = 60_000;

export function UnreadCountsProvider({
  counts,
  children,
}: {
  counts: UnreadCounts;
  children: React.ReactNode;
}) {
  const [live, setLive] = useState(counts);

  // React's documented "reset state when a prop changes" pattern, during
  // render rather than in an effect — see the last paragraph above.
  const [lastFromServer, setLastFromServer] = useState(counts);
  if (counts.notifications !== lastFromServer.notifications || counts.support !== lastFromServer.support) {
    setLastFromServer(counts);
    setLive(counts);
  }

  usePolling(
    async () => {
      setLive(await getUnreadCounts());
    },
    { active: true, intervalMs: UNREAD_POLL_INTERVAL_MS },
  );

  return <UnreadCountsContext.Provider value={live}>{children}</UnreadCountsContext.Provider>;
}

export function useUnreadCounts(): UnreadCounts {
  return useContext(UnreadCountsContext);
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePolling } from "@/lib/hooks/usePolling";

/**
 * Re-renders the server component tree it sits in, on an interval, so the
 * rates on screen are the rates now.
 *
 * Home and Convert both render their rates once per request and then never
 * again. Leave either screen open over lunch and it is still showing the rate
 * from an hour ago, with nothing admitting it — which is the worst version of
 * this, because the number looks exactly as authoritative as a live one.
 *
 * WHY router.refresh() AND NOT A CLIENT-SIDE FETCH: the markup, the route
 * table and the provider call all live server-side, and the one rule this
 * codebase holds to about rates is that the client never multiplies a rate it
 * was handed and calls the result a quote. Re-running the server render keeps
 * that intact — there is no second code path that could disagree with the
 * first.
 *
 * PAUSED WHILE HIDDEN, and refreshed once on becoming visible again. A
 * background tab polling a paid provider API every minute forever is somebody
 * else's bill, and the moment the user looks at the tab again is exactly when
 * the number needs to be right.
 *
 * GROUP 11b moved both halves of that paragraph into usePolling, where every
 * other poller in the app can reach them. This component used to own the only
 * implementation — a visibilitychange subscription, an `active: visible` gate
 * and a ref comparing the previous visibility to catch the transition — which
 * is why the deposit sheet and the activity detail view, which use the same
 * hook, did not have it. What is left here is the part that is actually about
 * rates: re-render the server tree, and say when.
 */
export function LiveRefresh({
  intervalMs = 60_000,
  /** Shows "Updated HH:MM" beside whatever it is refreshing. */
  showTimestamp = false,
  label = "Updated",
}: {
  intervalMs?: number;
  showTimestamp?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // `active: true` because there is no state in which a rate board stops
  // being worth refreshing — unlike a transaction, a price has no final
  // status. Pausing while the tab is hidden and refreshing once on the way
  // back is the hook's, and is what `active: true` now means here.
  usePolling(
    () => {
      router.refresh();
      setUpdatedAt(new Date());
    },
    { active: true, intervalMs },
  );

  if (!showTimestamp || !updatedAt) return null;

  return (
    <p aria-live="polite" className="text-xs text-muted-foreground">
      {label}{" "}
      <time dateTime={updatedAt.toISOString()}>
        {updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </time>
    </p>
  );
}

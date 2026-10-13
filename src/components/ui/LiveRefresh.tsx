"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { usePolling } from "@/lib/hooks/usePolling";

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function isDocumentVisible() {
  return document.visibilityState === "visible";
}

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
  // Subscribed rather than mirrored into state from an effect: visibility is
  // an external store, and useSyncExternalStore is what React provides for
  // reading one without a synchronous setState on mount.
  const visible = useSyncExternalStore(subscribeToVisibility, isDocumentVisible, () => true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Refresh on coming BACK to the tab, which is exactly the moment the number
  // needs to be right. Compared against the previous value so this fires on
  // the transition and not on first paint — on first render the data is as
  // fresh as the request that produced it.
  const wasVisible = useRef(visible);
  useEffect(() => {
    const became = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (became) {
      router.refresh();
      setUpdatedAt(new Date());
    }
  }, [visible, router]);

  usePolling(
    () => {
      router.refresh();
      setUpdatedAt(new Date());
    },
    { active: visible, intervalMs },
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

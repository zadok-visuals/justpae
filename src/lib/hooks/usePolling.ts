"use client";

import { useEffect, useRef } from "react";

/**
 * Re-run something on an interval while it is still worth re-running.
 *
 * Only deposits polled. A pending withdrawal or conversion, opened in its
 * detail view, never updated — so the user sat watching a row that said
 * "pending" long after it had in fact completed, and found out by reloading
 * the page by hand. That is the sort of silence that generates a support
 * message about money.
 *
 * THE SHAPE, and why `active` rather than a `stop()` the callback calls:
 * whether a transaction is final is derivable from the data already on screen,
 * so the caller passes that in and the hook does the rest. A callback that has
 * to remember to stop its own timer is a callback that eventually forgets, and
 * then polls a completed transfer forever in a tab somebody left open.
 *
 * The callback is held in a ref so a caller can pass an inline arrow function
 * without the interval being torn down and rebuilt on every render — which,
 * with a 10-second interval and a render on each response, would reset the
 * clock before it ever fired.
 */
export const STATUS_POLL_INTERVAL_MS = 10_000;

/**
 * The transaction states that will never change again.
 *
 * 'expired' belongs here (migration 0029): once the provider's transfer
 * details have lapsed, nothing can arrive against them, so a screen polling
 * an expired deposit is asking a question with a permanent answer. Leaving it
 * out was the difference between a sheet that settles and one that polls
 * every ten seconds for as long as the tab is open.
 *
 * 'partially_completed' is deliberately NOT here. A two-leg conversion that
 * stalled in the middle can still be finished by an operator, so it is a
 * resting state rather than a final one.
 */
export function isFinalStatus(status: string | null | undefined): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "refunded" ||
    status === "expired"
  );
}

export function usePolling(
  callback: () => void | Promise<void>,
  {
    active,
    intervalMs = STATUS_POLL_INTERVAL_MS,
  }: { active: boolean; intervalMs?: number },
) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!active) return;

    let running = false;
    const interval = setInterval(() => {
      // A slow response must not stack a second request on top of the first.
      // On a bad connection that is how a 10-second poll becomes a queue of
      // twelve in-flight requests that all land at once.
      if (running) return;
      running = true;
      void Promise.resolve(callbackRef.current()).finally(() => {
        running = false;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [active, intervalMs]);
}

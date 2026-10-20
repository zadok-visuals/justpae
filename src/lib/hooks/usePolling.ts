"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

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
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GROUP 11b — PAUSING WHILE HIDDEN IS THE HOOK'S JOB, NOT THE CALLER'S
 *
 * This behaviour existed, in one place, written by hand: LiveRefresh
 * subscribed to visibilitychange, gated its own `active` on it, and kept a ref
 * to refresh once on the way back. Everything else that polled did not. So a
 * deposit sheet left open in a background tab asked the server for the status
 * of a transfer nobody was looking at, every ten seconds, for as long as the
 * tab existed — and the detail view of a pending conversion did the same.
 *
 * On a phone that is the part that actually matters. A backgrounded tab on a
 * metered Nigerian connection polling every ten seconds spends the user's
 * data and the device's battery to compute a screen that is not on screen.
 * And this product's users keep tabs open: the whole reason these pollers
 * exist is that people sit on the deposit sheet waiting for money to land.
 *
 * It is now a property of the hook, which means:
 *
 *   * The three existing callers got it without being changed. The ones that
 *     needed it most — DepositForm, ActivityDetail — did not know they were
 *     missing it.
 *   * A poller added later cannot forget. There is no `active && visible` for
 *     a future caller to leave out, because `visible` is not theirs to pass.
 *   * LiveRefresh's hand-rolled version collapses into one argument. Two
 *     implementations of "pause while hidden" was one more than can be kept
 *     in agreement.
 *
 * AND RESUMING MEANS RUNNING IMMEDIATELY, NOT WAITING FOR THE NEXT TICK.
 * Coming back to the tab is exactly the moment the number has to be right,
 * and the interval could be a minute away. A rate board that shows a
 * two-minute-old price for another fifteen seconds after you look at it is
 * the failure this is for: the figure looks as authoritative as a live one.
 *
 * The run-on-return fires on the TRANSITION and not on mount — on first
 * render the data is as fresh as the request that produced it, and refreshing
 * immediately would mean every navigation paid for a second render of the
 * page it had just finished rendering.
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

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function isDocumentVisible() {
  return document.visibilityState === "visible";
}

/**
 * Whether the tab is in front, as a subscription rather than state.
 *
 * useSyncExternalStore because visibility IS an external store: mirroring it
 * into state from an effect means a synchronous setState on mount and a render
 * where the answer is wrong. The server snapshot is `true` — a server render
 * has no document, and starting from "visible" means the first client render
 * agrees with the markup it is hydrating.
 */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribeToVisibility, isDocumentVisible, () => true);
}

export function usePolling(
  callback: () => void | Promise<void>,
  {
    active,
    intervalMs = STATUS_POLL_INTERVAL_MS,
    /**
     * Run once when the tab comes back to the front, rather than waiting for
     * the next tick. On by default: every current caller wants it, and the one
     * that would not — a poller whose callback is expensive and whose data is
     * not time-sensitive — does not exist in this codebase yet.
     */
    runOnReturn = true,
  }: { active: boolean; intervalMs?: number; runOnReturn?: boolean },
) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const visible = useDocumentVisible();

  // Shared between the interval and the run-on-return, deliberately: a tick
  // that is still in flight when the user switches back must not be joined by
  // a second request for the same thing.
  //
  // Stable for the life of the hook — it closes over nothing but refs, which
  // is what lets both effects below depend on it without either of them
  // rebuilding when the caller re-renders.
  const runningRef = useRef(false);
  const runOnce = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    void Promise.resolve(callbackRef.current()).finally(() => {
      runningRef.current = false;
    });
  }, []);

  // Fires on the hidden→visible transition only. Compared against the previous
  // value rather than reading `visible` alone, so first paint does not count
  // as a return.
  const wasVisible = useRef(visible);
  useEffect(() => {
    const returned = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (returned && active && runOnReturn) runOnce();
  }, [visible, active, runOnReturn, runOnce]);

  useEffect(() => {
    // The timer is torn down while hidden rather than left running with a
    // guard inside it. A guard inside the tick still wakes the tab's timer
    // thread on a schedule for as long as it is open; no timer is no wakeups,
    // which is the difference the battery notices.
    if (!active || !visible) return;

    const interval = setInterval(() => {
      // A slow response must not stack a second request on top of the first.
      // On a bad connection that is how a 10-second poll becomes a queue of
      // twelve in-flight requests that all land at once.
      runOnce();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [active, visible, intervalMs, runOnce]);
}

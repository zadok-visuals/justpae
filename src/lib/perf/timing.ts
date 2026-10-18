/**
 * Server timing, behind PERF_TIMING. Off by default and free when off.
 *
 * WHAT IT ANSWERS: for one request, how long the route took in total and
 * which individual data calls inside it accounted for that. "The page is
 * slow" is not actionable; "the page took 1,840ms and 1,610ms of it was one
 * provider rate call" is, and it is the difference between caching the right
 * thing and caching something that was never the problem.
 *
 * HOW THE PER-REQUEST SCOPE WORKS. React's cache() memoises per render pass,
 * which in the App Router means per request. `marks()` therefore returns the
 * same array to everything rendering the same request and a fresh one for the
 * next — no AsyncLocalStorage, no module-level state leaking between
 * concurrent requests, which with a module-level array it absolutely would.
 *
 * WHY THE TOTAL IS NOT ALSO TAKEN FROM cache(). The route total has to start
 * before the first data call and end after the last one, and the page is the
 * only thing that knows where those are. startRouteTiming() returns the
 * stopper so that span is explicit at the call site rather than inferred from
 * whichever mark happened to land first.
 *
 * COST WHEN OFF: `timed` returns fn() directly — no timer, no array, no
 * cache() lookup. The flag is read once at module load.
 */

import { cache } from "react";

export const PERF_TIMING_ENABLED =
  process.env.PERF_TIMING === "1" || process.env.PERF_TIMING === "true";

type Mark = { label: string; ms: number; failed?: boolean };

/** Per-request, via React cache(). See the note above on why not a module array. */
const marks = cache((): Mark[] => []);

/**
 * Times one data call and records it under `label`.
 *
 * Records failures too, with failed: true. A call that threw after 3 seconds
 * is the most interesting line in the log, and an implementation that only
 * timed successes would be silent about exactly that.
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!PERF_TIMING_ENABLED) return fn();

  const started = performance.now();
  try {
    const result = await fn();
    marks().push({ label, ms: performance.now() - started });
    return result;
  } catch (err) {
    marks().push({ label, ms: performance.now() - started, failed: true });
    throw err;
  }
}

/**
 * Opens a route span. Call the returned function once the page's data is in.
 *
 * Safe to call unconditionally: when the flag is off it returns a no-op, so
 * pages do not each need their own `if`.
 */
export function startRouteTiming(route: string): () => void {
  if (!PERF_TIMING_ENABLED) return () => {};

  const started = performance.now();
  return () => {
    const total = performance.now() - started;
    const calls = marks();
    const detail = calls
      .map((m) => `${m.label}=${m.ms.toFixed(0)}ms${m.failed ? " (failed)" : ""}`)
      .join(" ");
    // console.error, not console.log: the repo's lint rule allows error and
    // warn only, so that anything printed is a deliberate choice. This is one.
    console.error(
      `[perf] route=${route} total=${total.toFixed(0)}ms calls=${calls.length}${detail ? ` ${detail}` : ""}`,
    );
  };
}

"use client";

import { useEffect, useRef, useTransition } from "react";

/**
 * GROUP 11a — one debounce, one supersede rule, for every priced form.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES
 *
 * ConvertForm and PayToChinaForm each had their own copy of the same twelve
 * lines: a `latestRequest` counter in a ref, a setTimeout, a useTransition, a
 * cleanup that cleared the timer, and an `if (requestId !== latest) return`
 * after the await. Identical logic, written twice, with one difference that
 * nobody intended — and that is the problem with two copies of something
 * this fiddly rather than the duplication itself.
 *
 * The rule it enforces is a money rule, not a performance one, and it is
 * worth stating in one place: THE FIGURE ON SCREEN MUST BELONG TO THE AMOUNT
 * ON SCREEN. Without the supersede check, a user typing 150000 can see the
 * quote for 15000 land last — because responses do not arrive in the order
 * they were sent — and press Convert on a rate priced for a tenth of the
 * money. The server re-prices at execution so they would not be charged
 * wrongly, but they would have agreed to a number that was never theirs,
 * which in a money product is its own failure.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT "CANCEL STALE ONES" HONESTLY MEANS HERE
 *
 * Two mechanisms, and only the first is cancellation:
 *
 *   1. BEFORE DISPATCH — the debounce timer is cleared, so the request is
 *      never made. This is the one that matters for cost: a six-digit naira
 *      amount is one provider lookup at the end rather than six, and every
 *      keystroke cancels the request the previous keystroke had queued.
 *
 *   2. AFTER DISPATCH — the response is discarded by sequence number and
 *      never reaches state.
 *
 * The second is a DISCARD, not an abort. These are Next.js server actions:
 * the dispatch is a fetch React owns and it takes no AbortSignal, so there is
 * no way from here to stop the server work or the socket. Saying "cancelled"
 * about it would be a claim this code cannot keep. What it does guarantee is
 * the part the user can actually observe: at most one result is ever applied,
 * and it is always the newest.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 300ms, AND WHY NOT THE 400 THAT WAS THERE
 *
 * 400ms was the figure both forms used. It is above the threshold where a
 * delay stops reading as "it is working on it" and starts reading as "it did
 * not notice" — the usual citation is 100ms for instant and around 300ms for
 * the edge of a perceptible pause, and a quote appearing after a four-tenths
 * gap on a form where the user is watching a number is on the wrong side of
 * it. 300ms is still comfortably longer than the gap between keystrokes of
 * somebody typing a number, so it does not cost extra provider calls to buy
 * that back.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY A KEY STRING RATHER THAN THE INPUT OBJECT
 *
 * The obvious API takes the request's input and re-runs when it changes — and
 * would re-run on every render, because `{ from, to, amount }` is a new object
 * each time. Comparing deeply would mean this hook deciding what counts as
 * equal for someone else's payload. A key the caller builds is explicit about
 * what a new quote depends on, which is exactly the thing worth being
 * explicit about: a field left out of the key is a field whose change does
 * not re-price.
 *
 * `request` and `onResult` are held in refs so the caller can pass inline
 * closures over current state without restarting the debounce on every
 * keystroke — which would mean the timer never fires and the form never
 * prices anything.
 */

/** The debounce every priced form uses. See the note above for the number. */
export const QUOTE_DEBOUNCE_MS = 300;

export function useDebouncedQuote<TResult>({
  key,
  enabled,
  request,
  onResult,
  debounceMs = QUOTE_DEBOUNCE_MS,
}: {
  /**
   * Everything a quote depends on, as a string. A change here re-prices; a
   * field missing from it will not.
   */
  key: string;
  /**
   * False when there is nothing to price — an empty amount, or a pair whose
   * answer is already known without asking. Nothing is scheduled and nothing
   * in flight is applied.
   */
  enabled: boolean;
  request: () => Promise<TResult>;
  onResult: (result: TResult) => void;
  debounceMs?: number;
}): { pending: boolean } {
  const requestRef = useRef(request);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    requestRef.current = request;
    onResultRef.current = onResult;
  }, [request, onResult]);

  // useTransition, so the keystroke that triggered the re-price is never the
  // thing waiting on it. The state write that lands the quote is a transition
  // update, which React is free to interrupt for the next character the user
  // types — which is the whole reason the input stays responsive while a
  // provider call is in flight.
  const [pending, startQuoting] = useTransition();

  // Monotonic, never reset. The sequence number of the newest request anyone
  // has asked for; a response carrying anything lower is stale by definition.
  const latest = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    // Claimed BEFORE the timer, not inside it, so a request that is
    // superseded while still only queued also invalidates anything older that
    // is already in flight.
    const seq = ++latest.current;

    const timer = setTimeout(() => {
      startQuoting(async () => {
        const result = await requestRef.current();
        if (seq !== latest.current) return;
        onResultRef.current(result);
      });
    }, debounceMs);

    return () => clearTimeout(timer);
    // `key` is the dependency by design — see the note above.
  }, [key, enabled, debounceMs]);

  return { pending };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative } from "node:path";

/**
 * GROUP 11 — the two client rules, asserted against source text.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY SOURCE TEXT AND NOT BEHAVIOUR
 *
 * Both properties are about the module graph and neither can be tested by
 * running anything. There is no DOM in this test runner (`node --test` over
 * the repo's test glob, no jsdom, no testing-library), and adding one to assert
 * "the timer is torn down when document.hidden flips" would be a large amount
 * of machinery to check a line that is already readable.
 *
 * More to the point, a behavioural test would check the hook — and the hook is
 * not what regresses. What regresses is the next form, written by somebody in
 * a hurry, with its own setTimeout in it. That is a module-graph fact, so
 * these are module-graph assertions. Same shape, and the same reasoning, as
 * src/lib/rates/cache.test.ts from Group 9: a lint rule written as a test,
 * whose failure message can explain the consequence rather than name a rule.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THESE WOULD HAVE CAUGHT
 *
 * Both rules were already broken when Group 11 started, in exactly the way a
 * test like this prevents:
 *
 *   - FOUR components had their own copy of the debounce-and-supersede dance
 *     (Convert, Pay to China, Withdraw, Bills), with four different timings
 *     and four chances to get the stale-response check subtly wrong.
 *   - usePolling had no visibility gate at all, so the deposit sheet and the
 *     activity detail view polled a background tab every ten seconds — while
 *     LiveRefresh, which had written the gate by hand, did not.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "..", "..");

function source(relativePath: string): string {
  return readFileSync(resolve(SRC, relativePath), "utf8");
}

/** Every .ts/.tsx file under src, excluding the tests themselves. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const ALL_FILES = walk(SRC).map((f) => relative(SRC, f).split("\\").join("/"));

// ══════════════════════════════════════════════════════════════════════════
// 11b — every poller pauses when the tab is hidden
// ══════════════════════════════════════════════════════════════════════════

/**
 * The claim "every poller pauses when the tab is hidden" is only true if
 * every poller IS usePolling. A component with its own setInterval has its own
 * answer to the question, and the honest-looking version of the wrong answer
 * is the one SupportChat shipped: `if (!document.hidden)` inside the tick,
 * which skips the request but leaves the timer waking the tab on a schedule,
 * and delays the catch-up until the next interval after the user comes back.
 *
 * useCountdown is the one exemption, and it is a real one rather than a
 * grandfather clause. It ticks a CLOCK, not a request: it re-reads Date.now()
 * once a second to re-render a countdown whose target is a fixed timestamp.
 * Pausing it while hidden would be wrong in the user-visible sense — the
 * countdown would be stale on return — and it costs nothing to leave running
 * because it makes no network call. It is also why the rule is written about
 * setInterval rather than about timers generally.
 */
const POLLER_EXEMPT = new Set(["lib/hooks/usePolling.ts", "lib/hooks/useCountdown.ts"]);

test("no component runs its own polling interval — they all go through usePolling", () => {
  const offenders = ALL_FILES.filter(
    (path) => !POLLER_EXEMPT.has(path) && /setInterval\s*\(/.test(source(path)),
  );

  assert.deepEqual(
    offenders,
    [],
    `these files call setInterval directly: ${offenders.join(", ")}. A poller ` +
      `outside usePolling does not pause when the tab is hidden, so it spends ` +
      `a user's mobile data and battery polling a screen nobody is looking at ` +
      `— and it does not catch up when they come back, which is the moment the ` +
      `number has to be right. Use usePolling, or add a reasoned exemption to ` +
      `POLLER_EXEMPT in this file.`,
  );
});

test("usePolling tears the timer down while the tab is hidden, rather than guarding inside it", () => {
  const hook = source("lib/hooks/usePolling.ts");

  // The gate is on the effect that OWNS the interval. A guard inside the tick
  // would still wake the tab's timer thread on a schedule for as long as it
  // is open.
  assert.match(
    hook,
    /if\s*\(!active\s*\|\|\s*!visible\)\s*return;/,
    "the interval effect must bail out while hidden, so no timer exists at all",
  );
  assert.match(
    hook,
    /useSyncExternalStore\(subscribeToVisibility/,
    "visibility must be read as an external store, not mirrored into state",
  );
});

test("usePolling runs once on returning to the tab", () => {
  const hook = source("lib/hooks/usePolling.ts");
  assert.match(
    hook,
    /const returned = visible && !wasVisible\.current;/,
    "the catch-up must fire on the hidden→visible TRANSITION — reading `visible` " +
      "alone would refresh on first paint too, making every navigation pay for a " +
      "second render of the page it had just rendered",
  );
  assert.match(hook, /if \(returned && active && runOnReturn\) runOnce\(\);/);
});

// ══════════════════════════════════════════════════════════════════════════
// 11a — one debounce, and no form rolls its own
// ══════════════════════════════════════════════════════════════════════════

/**
 * Every form that prices something against the server. Each of these had its
 * own debounce; all four now share one, which is the only way the supersede
 * rule can be guaranteed to be identical in all of them.
 */
const PRICED_FORMS = [
  "components/convert/ConvertForm.tsx",
  "components/payToChina/PayToChinaForm.tsx",
  "components/withdraw/WithdrawForm.tsx",
  "components/bills/BillForm.tsx",
];

test("every priced form debounces through the shared hook", () => {
  for (const path of PRICED_FORMS) {
    const text = source(path);
    assert.match(
      text,
      /useDebouncedQuote\(\{/,
      `${path} must price through useDebouncedQuote`,
    );
    assert.ok(
      !/setTimeout\s*\(/.test(text),
      `${path} has its own setTimeout. Four hand-rolled copies of ` +
        `debounce-and-discard-the-stale-response is how one of them ends up ` +
        `showing the quote for an amount the user has already typed over.`,
    );
  }
});

test("the convert and pay-to-china quotes use the 300ms default", () => {
  // The brief specifies about 300ms for these two. Withdraw (500) and Bills
  // (600) pass an explicit debounceMs for reasons recorded at their call
  // sites, so "no debounceMs" is what pins these two to the default.
  for (const path of ["components/convert/ConvertForm.tsx", "components/payToChina/PayToChinaForm.tsx"]) {
    assert.ok(
      !/debounceMs:/.test(source(path)),
      `${path} must take useDebouncedQuote's default debounce, not its own`,
    );
  }
  assert.match(
    source("lib/hooks/useDebouncedQuote.ts"),
    /QUOTE_DEBOUNCE_MS = 300/,
    "the shared default must be 300ms",
  );
});

test("the supersede check happens after the await, and the sequence is claimed before the timer", () => {
  const hook = source("lib/hooks/useDebouncedQuote.ts");

  // Claimed before the setTimeout, so a request superseded while still only
  // queued also invalidates anything older that is already in flight.
  const seqIndex = hook.indexOf("const seq = ++latest.current;");
  const timerIndex = hook.indexOf("setTimeout(");
  assert.ok(seqIndex > 0 && timerIndex > seqIndex, "the sequence must be claimed before the timer");

  assert.match(
    hook,
    /const result = await requestRef\.current\(\);\s*\n\s*if \(seq !== latest\.current\) return;/,
    "a response must be checked against the newest sequence number BEFORE it " +
      "reaches state — otherwise a user typing 150000 can be shown the quote " +
      "for 15000 and press Convert on it",
  );
});

test("useDebouncedQuote keeps the input responsive with a transition", () => {
  assert.match(
    source("lib/hooks/useDebouncedQuote.ts"),
    /const \[pending, startQuoting\] = useTransition\(\);/,
    "the state write that lands a quote must be a transition update, so React " +
      "can interrupt it for the next character the user types",
  );
});

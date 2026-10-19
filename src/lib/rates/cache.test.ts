import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * GROUP 9a — the rule the rate cache lives or dies by, asserted.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST READS SOURCE TEXT INSTEAD OF CALLING ANYTHING
 *
 * The property is "no commit path settles at a cached rate", and it cannot be
 * tested by execution. Calling quoteConversion needs a provider, a database
 * and a session; and even with all three, a cached and a live read return the
 * SAME number inside the 30-second window — which is exactly the problem.
 * A behavioural test would pass on the day the cache was wired into
 * executeConversion by mistake, and keep passing until a rate moved while
 * somebody was mid-conversion. The bug is in the module graph, so the
 * assertion is about the module graph.
 *
 * This is a lint rule written as a test. That is the right shape for it: it
 * is cheap, it runs in `npm test` with everything else, and its failure
 * message can explain the money consequence rather than naming a rule id.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT WOULD BREAK IT
 *
 * One `import { cachedUsdtPairRates } from "@/lib/rates/cache"` added to
 * actions/convert.ts or cny/pricing.ts while making something faster. The
 * change would look like an obvious win, the tests would pass, the pages
 * would render, and the product would start settling conversions at prices up
 * to 30 seconds old — in whichever direction the market had moved, on every
 * conversion, invisibly, because the number in the row afterwards would look
 * entirely reasonable.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "..", "..");

function source(relativePath: string): string {
  return readFileSync(resolve(SRC, relativePath), "utf8");
}

/**
 * Every module on a path that MOVES MONEY at a rate.
 *
 * convert.ts is listed even though it legitimately uses the cache in
 * listRoutesFrom — see the separate test below, which checks the shape of
 * that one permitted use rather than banning the file outright.
 */
const COMMIT_MODULES = [
  "lib/actions/convert.ts",
  "lib/actions/payToChina.ts",
  "lib/actions/deposits.ts",
  "lib/actions/withdrawals.ts",
  "lib/cny/pricing.ts",
  "lib/cny/priceCore.ts",
  "lib/convert/sequence.ts",
  "lib/busha/payout.ts",
];

const CACHE_IMPORT = /from\s+["'](?:@\/lib\/rates\/cache|\.\/cache|\.\.\/rates\/cache)["']/;

test("no money-moving module imports the display rate cache", () => {
  for (const path of COMMIT_MODULES) {
    // convert.ts is the one file allowed to reference the cache, and only
    // through resolveRoutesFrom's "cached" argument — never by importing it.
    assert.ok(
      !CACHE_IMPORT.test(source(path)),
      `${path} imports src/lib/rates/cache.ts. A commit path must resolve its ` +
        `rate live: settling at a cached price means paying a rate up to ` +
        `${30} seconds stale, on every order, with nothing in the row to show it.`,
    );
  }
});

/**
 * The other half: the two places that DO use the cache must say so
 * explicitly, so the opt-in stays visible at the call site rather than
 * becoming a default somebody inherits.
 */
test("only the two display resolvers opt into the cache", () => {
  const display = source("lib/rates/display.ts");
  const convert = source("lib/actions/convert.ts");

  assert.match(
    display,
    /resolveRoute\(currency, "USDT", "cached"\)/,
    "the rate board should read the display cache",
  );
  assert.match(
    convert,
    /resolveRoutesFrom\(from, CURRENCY_CODES, "cached"\)/,
    "listRoutesFrom should read the display cache",
  );

  // And the quote/execute calls in the same file must NOT.
  const cachedResolveRoute = convert.match(/resolveRoute\([^)]*"cached"[^)]*\)/g) ?? [];
  assert.deepEqual(
    cachedResolveRoute,
    [],
    "quoteConversion and executeConversion must call resolveRoute with no source, " +
      "which defaults to live",
  );
});

/**
 * resolveRoute's default. If this ever flips to "cached", every caller that
 * does not name a source — which is every commit path — silently starts
 * settling at a stale rate. It is one character to change and impossible to
 * see in a diff of a different file.
 */
test("resolveRoute defaults to a live rate", () => {
  const routes = source("lib/rates/routes.ts");
  assert.match(
    routes,
    /source: RateSource = "live"/,
    "resolveRoute's default rate source must be live",
  );
  // resolveRoutesFrom has the same default and the same stakes.
  const liveDefaults = routes.match(/source: RateSource = "live"/g) ?? [];
  assert.equal(
    liveDefaults.length,
    2,
    "both resolveRoute and resolveRoutesFrom must default to live",
  );
});

/**
 * The admin invalidation. A markup edit that an operator cannot see land is a
 * markup edit they make twice.
 */
test("the markup actions purge the cache tag", () => {
  for (const path of ["lib/actions/admin.ts", "lib/actions/adminCnyRates.ts"]) {
    const text = source(path);
    assert.match(
      text,
      /updateTag\(RATES_CACHE_TAG\)/,
      `${path} must purge RATES_CACHE_TAG so a markup change shows immediately`,
    );
  }
});

/**
 * The window. Named here so changing it is a deliberate edit to a test rather
 * than a number nudged in passing — 30 seconds is the figure the brief
 * specifies and the one the staleness argument in cache.ts is written around.
 */
test("the display cache window is 30 seconds", () => {
  assert.match(source("lib/rates/cache.ts"), /RATES_CACHE_SECONDS = 30/);
});

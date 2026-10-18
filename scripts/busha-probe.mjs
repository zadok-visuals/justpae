/**
 * The Busha read-only diagnostic. FOR THE OWNER TO RUN, NOT FOR AN AGENT.
 *
 *   node --env-file=.env.local scripts/busha-probe.mjs
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS SCRIPT EXISTS AND WHY IT HAS NEVER BEEN RUN FROM HERE
 *
 * Group 6d asks for the Busha integration to be tested against the real API.
 * There is no Busha sandbox configured for this project: BUSHA_API_BASE_URL
 * points at https://api.busha.io, and BUSHA_API_KEY is a live key against a
 * real balance. Every agent run on this task has written this script and
 * stopped at running it, which is the correct call and is why it is now
 * committed rather than rewritten from scratch each time.
 *
 * WHAT MAKES IT SAFE TO RUN AT ALL: every call below is a GET, and the two
 * that are not — createQuote and createTransfer — are deliberately absent.
 * A quote is harmless; a transfer MOVES REAL MONEY. If you extend this, keep
 * that line: this file reads, and nothing in it writes.
 *
 * WHAT IT WILL NOT DO:
 *   - print, log or write the API key anywhere, including on failure;
 *   - create a quote, a recipient, a transfer or any other object;
 *   - touch the Supabase database.
 *
 * WHAT IT ANSWERS, which is what Group 6d actually needs to know:
 *   1. Does the key authenticate at all?
 *   2. Which fiat/USDT pairs does the account have live, and at what rate?
 *      (Confirms or refutes the standing claim that GHS has no pair.)
 *   3. Does the bank list come back, and how large is it?
 *
 * Output goes to stderr, matching the other scripts here — the repo's
 * no-console rule allows error and warn precisely so that script output is a
 * deliberate choice rather than a stray debug line.
 */

const KEY = process.env.BUSHA_API_KEY;
const BASE = process.env.BUSHA_API_BASE_URL ?? "https://api.busha.io";

if (!KEY) {
  console.error(
    "Missing BUSHA_API_KEY.\n" + "Run with: node --env-file=.env.local scripts/busha-probe.mjs",
  );
  process.exit(1);
}

// Never interpolated into output. Only ever into a header.
const headers = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

/** GET only. There is no request-body parameter here on purpose. */
async function get(path) {
  const res = await fetch(`${BASE}${path}`, { method: "GET", headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body; status is still the useful part */
  }
  return { status: res.status, ok: res.ok, json, raw: text.slice(0, 300) };
}

console.error(`Busha read-only probe against ${BASE}`);
console.error(`Key: ${KEY.slice(0, 4)}…${KEY.slice(-2)} (${KEY.length} chars)\n`);

// ── 1. Does the key authenticate? ─────────────────────────────────────────
// The bank list is the cheapest authenticated GET on the API.
const banks = await get("/v1/banks?country=NG");
if (banks.status === 401 || banks.status === 403) {
  console.error(`FAIL  authentication rejected (HTTP ${banks.status}).`);
  console.error("      The key is wrong, revoked, or for a different environment.");
  process.exit(1);
}
if (!banks.ok) {
  console.error(`WARN  /v1/banks returned HTTP ${banks.status}: ${banks.raw}`);
} else {
  const list = Array.isArray(banks.json?.data) ? banks.json.data : [];
  console.error(`PASS  authenticated. NG bank list: ${list.length} entries.`);
}

// ── 2. Which pairs are live? ──────────────────────────────────────────────
// The question Group 6d is really asking. GHS is expected to be absent —
// src/lib/busha/payout.ts and src/lib/rates/routes.ts both assume it is.
const PAIRS = [
  ["USDT", "NGN"],
  ["USDT", "KES"],
  ["USDT", "GHS"],
  ["USDT", "USD"],
  ["NGN", "USDT"],
  ["KES", "USDT"],
  ["GHS", "USDT"],
];

console.error("\nPairs:");
for (const [base, counter] of PAIRS) {
  const res = await get(`/v1/pairs/${base}-${counter}`);
  if (res.status === 404) {
    console.error(`  ${base}/${counter}  not quoted (404)`);
    continue;
  }
  if (!res.ok) {
    console.error(`  ${base}/${counter}  HTTP ${res.status}`);
    continue;
  }
  const d = res.json?.data ?? res.json;
  console.error(`  ${base}/${counter}  rate=${d?.rate ?? "?"} min=${d?.min ?? "?"} max=${d?.max ?? "?"}`);
}

console.error("\nDone. Nothing was created and no money moved.");

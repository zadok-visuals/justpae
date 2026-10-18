/**
 * The Busha diagnostic. FOR THE OWNER TO RUN, OR FOR AN AGENT THE OWNER HAS
 * EXPLICITLY AUTHORISED FOR A GIVEN MODE.
 *
 *   node --env-file=.env.local scripts/busha-probe.mjs
 *   node --env-file=.env.local scripts/busha-probe.mjs --quote-only
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE LINE THIS FILE DOES NOT CROSS
 *
 * There is no Busha sandbox configured for this project: BUSHA_API_BASE_URL
 * points at https://api.busha.io, and BUSHA_API_KEY is a live key against a
 * real balance.
 *
 *   - Default mode is GET-only. It reads; it creates nothing.
 *   - `--quote-only` additionally POSTs to /v1/quotes. A quote is a PRICE
 *     LOOKUP with an expiry. It reserves nothing, commits to nothing and
 *     moves no money; an unaccepted quote simply expires. This mode exists
 *     because the deposit-quote failure cannot be diagnosed from a GET.
 *   - POST /v1/transfers is what actually MOVES REAL MONEY, and it is absent
 *     from this file on purpose. `assertNoTransfers` below is a hard runtime
 *     stop so that no future edit can reach it through these helpers by
 *     accident. If you extend this script, keep that line.
 *
 * WHAT IT WILL NOT DO:
 *   - print, log or write the API key, or any fragment of it, anywhere —
 *     including on failure. Only its length is reported, which is enough to
 *     tell "the wrong key" from "no key at all" and reveals nothing usable;
 *   - create a recipient, a transfer or any other persistent object;
 *   - touch the Supabase database.
 *
 * WHAT IT ANSWERS:
 *   1. Does the key authenticate at all?
 *   2. Which fiat/USDT pairs does the account have live, and at what rate?
 *   3. Does the bank list come back, and how large is it?
 *   4. (--quote-only) Exactly what does /v1/quotes say to a deposit quote for
 *      NGN 5,000 / KES 500 / USDT 10 — the three the app offers — with the
 *      precise HTTP status and the verbatim error body for each.
 *
 * Output goes to stderr, matching the other scripts here — the repo's
 * no-console rule allows error and warn precisely so that script output is a
 * deliberate choice rather than a stray debug line.
 */

const KEY = process.env.BUSHA_API_KEY;
const BASE = process.env.BUSHA_API_BASE_URL ?? "https://api.busha.io";
const QUOTE_ONLY = process.argv.includes("--quote-only");

/**
 * The two "no key" cases are different problems and used to print the same
 * advice, which sent at least one investigation down the wrong path: the
 * variable being ABSENT means --env-file was forgotten, and the variable
 * being PRESENT BUT EMPTY means the env file is a skeleton copied from
 * .env.local.example and never filled in. The second looks like success from
 * the outside — the file exists, the name is in it, the command was right —
 * so it is worth naming explicitly.
 */
if (!KEY) {
  const declared = "BUSHA_API_KEY" in process.env;
  if (declared) {
    console.error(
      "BUSHA_API_KEY is declared but EMPTY.\n" +
        "\n" +
        "The env file was loaded — the variable is there — but it has no value,\n" +
        "which is what .env.local.example ships. There is no live key on this\n" +
        "machine, so no live probe can run here at all. Fill BUSHA_API_KEY in\n" +
        ".env.local with the real Business API secret key, or run this on a\n" +
        "machine that already has one.",
    );
  } else {
    console.error(
      "BUSHA_API_KEY is not set.\n" +
        "Run with: node --env-file=.env.local scripts/busha-probe.mjs",
    );
  }
  process.exit(1);
}

// Never interpolated into output. Only ever into a header.
const headers = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

/**
 * The hard stop. Every request in this file goes through here, so there is no
 * path to a transfer even if someone adds one later by copy-paste.
 */
function assertNoTransfers(path, method) {
  if (method !== "GET" && /\/v1\/transfers\b/.test(path)) {
    console.error(
      `REFUSED  ${method} ${path} — this script never executes a transfer. ` +
        "That call moves real money and is out of scope for a probe.",
    );
    process.exit(2);
  }
}

/** GET only. There is no request-body parameter here on purpose. */
async function get(path) {
  assertNoTransfers(path, "GET");
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

/**
 * POST /v1/quotes, and nothing else. The path is pinned here rather than taken
 * as an argument so this helper cannot be pointed at a different endpoint.
 */
async function postQuote(body) {
  assertNoTransfers("/v1/quotes", "POST");
  const res = await fetch(`${BASE}/v1/quotes`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body; status is still the useful part */
  }
  return { status: res.status, ok: res.ok, json, raw: text.slice(0, 2000) };
}

console.error(`Busha probe against ${BASE}${QUOTE_ONLY ? " (--quote-only)" : " (read-only)"}`);
console.error(`Key: ${KEY.length} chars (never printed, not even partially)\n`);

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

// The query form, matching getPair in src/lib/busha/client.ts. The older
// `/v1/pairs/BASE-COUNTER` path form this script used returns 404 for every
// pair, which reads as "no such pair" when it only ever meant "no such route".
console.error("\nPairs:");
for (const [base, counter] of PAIRS) {
  const res = await get(`/v1/pairs?base=${base}&counter=${counter}`);
  if (!res.ok) {
    console.error(`  ${base}/${counter}  HTTP ${res.status} ${res.raw}`);
    continue;
  }
  const list = Array.isArray(res.json?.data) ? res.json.data : [];
  const d = list[0];
  if (!d) {
    console.error(`  ${base}/${counter}  not quoted (empty)`);
    continue;
  }
  console.error(
    `  ${base}/${counter}  buy=${d.buy_price?.amount ?? "?"} sell=${d.sell_price?.amount ?? "?"} ` +
      `buy_supported=${d.is_buy_supported} sell_supported=${d.is_sell_supported}`,
  );
}

// ── 3. What can this account actually do? ─────────────────────────────────
//
// One of the candidate causes for the deposit failure is not the request shape
// at all: an account whose verification is incomplete, or whose deposit
// product was never enabled, is refused no matter how correct the body is.
// These are plain GETs, so they stay inside the read-only part of this script.
//
// READ THE RESULT CAREFULLY. A 404 here means "this API has no such route",
// NOT "your account cannot do this" — the endpoint names below are informed
// guesses at a surface the docs do not fully enumerate, and a uniform 404 for
// all of them is a fact about the API, not about the account. What is
// diagnostic is a 401/403 (the key lacks the scope) or a 200 whose body says
// the account is pending.
console.error("\nAccount capability (GET only; 404 = no such route, not a verdict):");
for (const path of ["/v1/accounts", "/v1/balances", "/v1/wallets", "/v1/me", "/v1/business"]) {
  const res = await get(path);
  const summary = res.ok
    ? `OK ${JSON.stringify(res.json?.data ?? res.json).slice(0, 220)}`
    : res.raw.slice(0, 180);
  console.error(`  ${path.padEnd(14)} HTTP ${res.status}  ${summary}`);
}

if (!QUOTE_ONLY) {
  console.error("\nDone. Nothing was created and no money moved.");
  console.error("Pass --quote-only to also price the three deposit quotes.");
  process.exit(0);
}

// ── 4. Deposit quotes (--quote-only) ──────────────────────────────────────
//
// The Group 2 question: NGN deposits fail at "Couldn't price that" while the
// GET pair rates above succeed, so the failure is specific to POST /v1/quotes
// with a pay_in. Each case below is the EXACT body
// src/lib/busha/client.ts#createQuote builds for that currency, so a failure
// here is the production failure and not a probe artefact.
//
// The variants that follow a failure strip one thing at a time — the pay_in,
// then the amount — to separate "this account cannot quote deposits at all"
// from "this amount is below a minimum" from "this currency is not enabled".
const DEPOSIT_CASES = [
  { currency: "NGN", amount: "5000", payIn: { type: "temporary_bank_account" } },
  { currency: "KES", amount: "500", payIn: { type: "temporary_bank_account" } },
  { currency: "USDT", amount: "10", payIn: { type: "address", network: "BSC" } },
];

function describe(res) {
  if (res.ok) {
    const d = res.json?.data ?? res.json;
    const fees = Array.isArray(d?.fees)
      ? d.fees.map((f) => `${f.name}=${f.amount?.amount} ${f.amount?.currency}`).join(", ")
      : "none";
    return (
      `HTTP ${res.status} OK  quote=${d?.id} source=${d?.source_amount} ` +
      `target=${d?.target_amount} fees=[${fees}] expires=${d?.expires_at}`
    );
  }
  return `HTTP ${res.status}  body=${res.raw}`;
}

/**
 * THE CONTROL, and the single most useful line this script prints.
 *
 * The Group 2 report is "deposit quotes fail while the Home rates work" — but
 * Home's rates come from GET /v1/pairs, which proves nothing about whether
 * this account can POST a quote at all. A cross-currency quote (the shape the
 * convert flow uses, with no pay_in) isolates that:
 *
 *   control FAILS  -> POST /v1/quotes is refused for this account generally.
 *                     The deposit body is not the problem; the account, the
 *                     key's scope or the product enablement is.
 *   control PASSES  -> quoting works and the difference is the deposit shape:
 *                     same-currency, or the pay_in object, or the amount.
 *
 * Without this line every deposit failure below is ambiguous between those
 * two, which is exactly the ambiguity that has kept this bug open.
 */
console.error("\nControl — a cross-currency quote with no pay_in (what convert sends):");
{
  const body = { source_currency: "NGN", target_currency: "USDT", source_amount: "20000" };
  const res = await postQuote(body);
  console.error(`    request : ${JSON.stringify(body)}`);
  console.error(`    response: ${res.ok ? "HTTP 200 OK — POST /v1/quotes works for this account" : `HTTP ${res.status}  body=${res.raw}`}`);
}

console.error("\nDeposit quotes (POST /v1/quotes — a price lookup, not a transfer):");
for (const c of DEPOSIT_CASES) {
  const body = {
    source_currency: c.currency,
    target_currency: c.currency,
    source_amount: c.amount,
    pay_in: c.payIn,
  };
  const res = await postQuote(body);
  console.error(`\n  ${c.currency} ${c.amount}  (as the app sends it)`);
  console.error(`    request : ${JSON.stringify(body)}`);
  console.error(`    response: ${describe(res)}`);

  if (res.ok) continue;

  // Variant A: same-currency quote with NO pay_in. If this succeeds, the
  // account can quote the currency and the pay_in object is the problem.
  const noPayIn = await postQuote({
    source_currency: c.currency,
    target_currency: c.currency,
    source_amount: c.amount,
  });
  console.error(`    variant (no pay_in)      : ${describe(noPayIn)}`);

  // Variant B: a much larger amount with the same pay_in. If this succeeds,
  // the probe amount was simply under an undocumented minimum.
  const bigger = { NGN: "100000", KES: "10000", USDT: "100" }[c.currency];
  const larger = await postQuote({
    source_currency: c.currency,
    target_currency: c.currency,
    source_amount: bigger,
    pay_in: c.payIn,
  });
  console.error(`    variant (${bigger})${" ".repeat(Math.max(0, 14 - bigger.length))}: ${describe(larger)}`);

  // Variant C: target_amount instead of source_amount. Some same-currency
  // deposit APIs only accept the destination leg.
  const byTarget = await postQuote({
    source_currency: c.currency,
    target_currency: c.currency,
    target_amount: c.amount,
    pay_in: c.payIn,
  });
  console.error(`    variant (target_amount)  : ${describe(byTarget)}`);
}

console.error("\nDone. Quotes were priced; no transfer was created and no money moved.");

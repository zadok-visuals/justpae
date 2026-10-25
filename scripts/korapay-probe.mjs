/**
 * The Korapay diagnostic. READ-ONLY.
 *
 *   node --env-file=.env.local scripts/korapay-probe.mjs
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE LINE THIS FILE DOES NOT CROSS
 *
 * Unlike the Busha probe beside it, Korapay HAS a usable sandbox, and a
 * sk_test_ key against it moves no real money. That does not make this script
 * a place to create things:
 *
 *   - Every request here is a GET, plus the one documented POST that resolves
 *     a bank account name. Resolution is a LOOKUP — it creates nothing,
 *     reserves nothing and moves nothing.
 *   - POST /transactions/disburse and POST /virtual-bank-account are absent on
 *     purpose. Both create persistent objects, and the second needs a BVN,
 *     which has no business being typed into a diagnostic script.
 *   - `assertReadOnly` below is a hard runtime stop so no future edit reaches
 *     either through these helpers by accident. If you extend this file, keep
 *     that line.
 *
 * THE KEY PREFIX IS CHECKED BEFORE ANY SOCKET OPENS. A key beginning sk_live_
 * stops the script outright. A live key against this API disburses real money
 * on the first mistake, and a probe is exactly where that mistake gets made.
 *
 * WHAT IT WILL NOT DO: print, log or write the key, or any fragment of it,
 * anywhere — including on failure. Only its length and its prefix are
 * reported, which separates "wrong key" from "no key" and "live key" from
 * "test key" while revealing nothing usable.
 *
 * WHAT IT ANSWERS:
 *   1. Is the key a TEST key, and does it authenticate?
 *   2. Does the NG bank list come back, and how large is it?
 *   3. Does account resolution work against a sandbox account number?
 *   4. What balances does the merchant hold, per currency?
 *   5. (NG only) Which KE mobile-money operator slugs exist, for payouts.
 *
 * Output goes to stderr, matching the other scripts here — the repo's
 * no-console rule allows error and warn precisely so script output is a
 * deliberate choice rather than a stray debug line.
 */

const KEY = process.env.KORAPAY_SECRET_KEY;
const PUBLIC_KEY = process.env.KORAPAY_PUBLIC_KEY;
const BASE = process.env.KORAPAY_API_BASE_URL ?? "https://api.korapay.com/merchant/api/v1";

/**
 * The two "no key" cases are different problems: ABSENT means --env-file was
 * forgotten, PRESENT BUT EMPTY means the env file is a skeleton copied from
 * .env.local.example and never filled in. The second looks like success from
 * the outside, so it is worth naming.
 */
if (!KEY) {
  const declared = "KORAPAY_SECRET_KEY" in process.env;
  console.error(
    declared
      ? "KORAPAY_SECRET_KEY is declared but EMPTY.\n" +
          "The env file loaded, but the variable has no value — which is what\n" +
          ".env.local.example ships. Put the sandbox secret key in .env.local."
      : "KORAPAY_SECRET_KEY is not set.\n" +
          "Run with: node --env-file=.env.local scripts/korapay-probe.mjs",
  );
  process.exit(1);
}

// ── THE SAFETY GATE ───────────────────────────────────────────────────────
// Before anything else, and before a socket is opened.
if (KEY.startsWith("sk_live_")) {
  console.error(
    "REFUSED  KORAPAY_SECRET_KEY is a LIVE key (sk_live_).\n" +
      "This probe only ever runs against the sandbox. A live key here reads\n" +
      "real balances and is one copy-paste away from moving real money.\n" +
      "Put the sk_test_ key in .env.local, or run this somewhere else.",
  );
  process.exit(2);
}
if (!KEY.startsWith("sk_test_")) {
  console.error(
    `REFUSED  KORAPAY_SECRET_KEY does not begin sk_test_ (it begins "${KEY.slice(0, 3)}…").\n` +
      "Only a recognised sandbox key is allowed to run this probe.",
  );
  process.exit(2);
}
if (PUBLIC_KEY && PUBLIC_KEY.startsWith("pk_live_")) {
  console.error("REFUSED  KORAPAY_PUBLIC_KEY is a LIVE key (pk_live_). Sandbox only.");
  process.exit(2);
}

if (!PUBLIC_KEY) {
  console.error(
    "KORAPAY_PUBLIC_KEY is not set, and half this API needs it.\n" +
      "The /misc lists (banks, mobile money) reject the secret key outright.",
  );
  process.exit(1);
}

/**
 * Never interpolated into output. Only ever into a header.
 *
 * TWO KEYS, and which one signs which call is not a preference — see the
 * KeyKind note in src/lib/korapay/client.ts. The /misc lists answer 401 to
 * the secret key; /balances answers 403 to the public one.
 */
function headersFor(key) {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/**
 * The hard stop. Every request in this file goes through here, so there is no
 * path to a disbursement or a virtual-account creation even if someone adds
 * one later by copy-paste.
 */
const WRITE_ALLOWLIST = ["/misc/banks/resolve"];

function assertReadOnly(path, method) {
  if (method === "GET") return;
  if (WRITE_ALLOWLIST.includes(path)) return;
  console.error(
    `REFUSED  ${method} ${path} — this script creates nothing. Disbursements and\n` +
      "         virtual accounts are out of scope for a probe.",
  );
  process.exit(2);
}

async function call(path, { method = "GET", body, auth = "secret" } = {}) {
  assertReadOnly(path, method);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: headersFor(auth === "public" ? PUBLIC_KEY : KEY),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return { status: 0, ok: false, json: null, raw: String(err?.message ?? err) };
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body; the status is still the useful part */
  }
  return { status: res.status, ok: res.ok, json, raw: text.slice(0, 400) };
}

console.error(`Korapay probe against ${BASE} (read-only, sandbox key)`);
console.error(`Secret key: sk_test_, ${KEY.length} chars (never printed, not even partially)`);
console.error(
  `Public key: ${PUBLIC_KEY ? `${PUBLIC_KEY.slice(0, 8)}…, ${PUBLIC_KEY.length} chars` : "not set"}\n`,
);

// ── 1. Does the key authenticate? ─────────────────────────────────────────
// The bank list is the cheapest authenticated GET on this API — and the one
// that takes the PUBLIC key, which the secret key is refused on.
const banks = await call("/misc/banks?countryCode=NG", { auth: "public" });
if (banks.status === 401 || banks.status === 403) {
  console.error(`FAIL  authentication rejected (HTTP ${banks.status}): ${banks.raw}`);
  console.error("      The key is wrong, revoked, or for a different environment.");
  process.exit(1);
}
const bankList = Array.isArray(banks.json?.data) ? banks.json.data : [];
if (!banks.ok || banks.json?.status === false) {
  console.error(`WARN  /misc/banks returned HTTP ${banks.status}: ${banks.raw}`);
} else {
  console.error(`PASS  authenticated. NG bank list: ${bankList.length} entries.`);
  for (const bank of bankList.slice(0, 5)) {
    console.error(`        ${bank.code ?? "?"}  ${bank.name ?? "?"}`);
  }
  if (bankList.length > 5) console.error(`        … and ${bankList.length - 5} more`);
}

// ── 2. Account resolution ─────────────────────────────────────────────────
// The name check that stands between a mistyped account number and a
// stranger's money. Korapay's docs publish 000 / 0000000000 as the sandbox
// pair; a real customer account number is deliberately not used here.
// NOT KORAPAY_VBA_BANK_CODE: the bank a virtual account is ISSUED against is
// a different question from the bank a payout resolves at. 033/0000000000 is
// Korapay's published sandbox success pair.
const SANDBOX_BANK = "033";
const SANDBOX_ACCOUNT = "0000000000";
console.error(`\nResolve ${SANDBOX_BANK} / ${SANDBOX_ACCOUNT}:`);
const resolved = await call("/misc/banks/resolve", {
  method: "POST",
  auth: "public",
  body: { bank: SANDBOX_BANK, account: SANDBOX_ACCOUNT },
});
if (resolved.ok && resolved.json?.status !== false) {
  console.error(`  PASS  ${resolved.json?.data?.account_name ?? "(no name in body)"}`);
} else {
  console.error(`  HTTP ${resolved.status}  ${resolved.json?.message ?? resolved.raw}`);
}

// ── 3. Balances ───────────────────────────────────────────────────────────
// What Group 3c reads before every payout and Group 4 reads for the sweep.
console.error("\nBalances:");
const balances = await call("/balances");
if (balances.ok && balances.json?.status !== false) {
  const data = balances.json?.data ?? {};
  const entries = Object.entries(data);
  if (entries.length === 0) console.error("  (no currencies returned)");
  for (const [currency, value] of entries) {
    console.error(
      `  ${currency}  available=${value?.available_balance ?? "?"} pending=${value?.pending_balance ?? "?"}`,
    );
  }
} else {
  console.error(`  HTTP ${balances.status}  ${balances.json?.message ?? balances.raw}`);
}

// ── 4. KE mobile-money operators ──────────────────────────────────────────
// The slugs Group 3a needs for an M-Pesa payout. Enumerated rather than
// guessed at: a wrong slug is a payout that silently never arrives.
console.error("\nKE mobile-money operators:");
const operators = await call("/misc/mobile-money?countryCode=KE", { auth: "public" });
if (operators.ok && operators.json?.status !== false) {
  const list = Array.isArray(operators.json?.data) ? operators.json.data : [];
  if (list.length === 0) console.error("  (none returned)");
  for (const op of list) console.error(`  ${op.slug ?? "?"}  ${op.name ?? "?"}`);
} else {
  console.error(`  HTTP ${operators.status}  ${operators.json?.message ?? operators.raw}`);
}

console.error("\nDone. Nothing was created and no money moved.");

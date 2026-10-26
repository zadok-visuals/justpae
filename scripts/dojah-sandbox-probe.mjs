/**
 * The Dojah BVN-validation diagnostic. READ-ONLY, SANDBOX-ONLY.
 *
 *   node --env-file=.env.local scripts/dojah-sandbox-probe.mjs
 *
 * Runs exactly one call — GET /api/v1/kyc/bvn — against Dojah's documented
 * test BVN (22222222222), which exists for this purpose and belongs to no
 * real person. Never run this with live keys: the gate below refuses to
 * proceed unless DOJAH_BASE_URL is the sandbox host, whatever keys are set.
 *
 * WHAT IT WILL NOT DO: print, log or write either key, or any fragment of
 * one — only their presence and length are reported. The response's
 * confidence/status fields are shown (that is the entire point of the
 * probe); nothing else in the response body is printed, on the same rule
 * src/lib/dojah/client.ts follows for every real call.
 */

const BASE = process.env.DOJAH_BASE_URL ?? "https://sandbox.dojah.io";
const APP_ID = process.env.DOJAH_APP_ID;
const SECRET_KEY = process.env.DOJAH_SECRET_KEY;

if (!APP_ID || !SECRET_KEY) {
  console.error(
    "DOJAH_APP_ID and/or DOJAH_SECRET_KEY are not set.\n" +
      "Run with: node --env-file=.env.local scripts/dojah-sandbox-probe.mjs",
  );
  process.exit(1);
}

// ── THE SAFETY GATE ───────────────────────────────────────────────────────
if (!/^https:\/\/sandbox\.dojah\.io\/?$/.test(BASE)) {
  console.error(
    `REFUSED  DOJAH_BASE_URL ("${BASE}") is not the sandbox host.\n` +
      "This probe only ever runs against https://sandbox.dojah.io.",
  );
  process.exit(2);
}

console.error(`Dojah probe against ${BASE} (read-only, sandbox)`);
console.error(`App ID: ${APP_ID.length} chars (never printed)`);
console.error(`Secret key: ${SECRET_KEY.length} chars (never printed)\n`);

// Dojah's own documented test BVN — not a real person's number.
const TEST_BVN = "22222222222";
const query = new URLSearchParams({
  bvn: TEST_BVN,
  first_name: "John",
  last_name: "Musa",
});

let res;
try {
  res = await fetch(`${BASE}/api/v1/kyc/bvn?${query.toString()}`, {
    method: "GET",
    headers: { Authorization: SECRET_KEY, AppId: APP_ID },
    signal: AbortSignal.timeout(20_000),
  });
} catch (err) {
  console.error(`FAIL  request did not complete: ${err?.message ?? err}`);
  process.exit(1);
}

const text = await res.text();
let json = null;
try {
  json = JSON.parse(text);
} catch {
  /* non-JSON body; the status is still the useful part */
}

if (!res.ok) {
  console.error(`FAIL  HTTP ${res.status}`);
  console.error(res.status === 401 || res.status === 403 ? "      The key is wrong or revoked." : "      See Dojah's dashboard for this account's status.");
  process.exit(1);
}

const entity = json?.entity ?? {};
console.error(`PASS  HTTP ${res.status}`);
console.error(`  last_name  status=${entity.last_name?.status ?? "?"} confidence=${entity.last_name?.confidence_value ?? "?"}`);
console.error(`  first_name status=${entity.first_name?.status ?? "?"} confidence=${entity.first_name?.confidence_value ?? "?"}`);
console.error("\nDone. Nothing was created.");

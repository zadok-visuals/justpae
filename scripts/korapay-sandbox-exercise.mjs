/**
 * The Korapay SANDBOX exercise. This one CREATES things.
 *
 *   node --env-file=.env.local scripts/korapay-sandbox-exercise.mjs deposit
 *   node --env-file=.env.local scripts/korapay-sandbox-exercise.mjs payout
 *
 * Separate from scripts/korapay-probe.mjs, which is read-only and must stay
 * that way. This is the one that issues a virtual account, simulates a credit
 * into it, and sends a payout — all against test keys, where none of it is
 * money.
 *
 * THE GATE: sk_test_ and pk_test_ only, checked before any socket opens. A
 * live key here would disburse real funds on the payout step.
 *
 * The BVN is an obviously-fake repeated-digit placeholder. A real one never
 * goes in a script.
 *
 * It touches no database. The deposit step feeds the real sandbox charge into
 * settleKorapayCharge with an in-memory double, so the decision logic is
 * exercised against a real provider response.
 */

import { settleKorapayCharge } from "../src/lib/korapay/settle.ts";

const KEY = process.env.KORAPAY_SECRET_KEY;
const PUBLIC_KEY = process.env.KORAPAY_PUBLIC_KEY;
const BASE = process.env.KORAPAY_API_BASE_URL ?? "https://api.korapay.com/merchant/api/v1";
const BANK_CODE = process.env.KORAPAY_VBA_BANK_CODE ?? "000";

if (!KEY || !PUBLIC_KEY) {
  console.error("KORAPAY_SECRET_KEY and KORAPAY_PUBLIC_KEY must both be set.");
  process.exit(1);
}
if (!KEY.startsWith("sk_test_") || !PUBLIC_KEY.startsWith("pk_test_")) {
  console.error("REFUSED  sandbox keys only (sk_test_ / pk_test_). This script creates things.");
  process.exit(2);
}

/** Never a real one, and never read from anywhere. */
const FAKE_BVN = "22222222222";
/** Korapay's published sandbox success pair for payouts. */
const SANDBOX_PAYOUT_BANK = "033";
const SANDBOX_PAYOUT_ACCOUNT = "0000000000";

async function call(path, { method = "GET", body, auth = "secret" } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${auth === "public" ? PUBLIC_KEY : KEY}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return { status: 0, ok: false, json: null, raw: String(err?.message ?? err) };
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* status is still the useful part */
  }
  return { status: res.status, ok: res.ok, json, raw: text.slice(0, 500) };
}

const step = process.argv[2];

if (step === "deposit") {
  const reference = `jp_sbx_${Date.now()}`;
  console.error(`1. POST /virtual-bank-account  (bank_code ${BANK_CODE}, ref ${reference})`);
  const created = await call("/virtual-bank-account", {
    method: "POST",
    body: {
      account_name: "justpae Sandbox Tester",
      account_reference: reference,
      permanent: true,
      bank_code: BANK_CODE,
      customer: { name: "Sandbox Tester", email: "sandbox.tester@example.com" },
      kyc: { bvn: FAKE_BVN },
    },
  });
  if (!created.ok || created.json?.status === false) {
    console.error(`   FAIL HTTP ${created.status}  ${created.raw}`);
    process.exit(1);
  }
  const account = created.json.data;
  console.error(
    `   PASS ${account.account_number} / ${account.bank_name} / "${account.account_name}"`,
  );

  console.error(`\n2. POST /virtual-bank-account/sandbox/credit  (NGN 7500)`);
  const credited = await call("/virtual-bank-account/sandbox/credit", {
    method: "POST",
    body: { account_number: account.account_number, currency: "NGN", amount: 7500 },
  });
  console.error(
    credited.ok && credited.json?.status !== false
      ? `   PASS ${JSON.stringify(credited.json?.data ?? credited.json?.message)}`
      : `   HTTP ${credited.status}  ${credited.json?.message ?? credited.raw}`,
  );

  console.error(`\n3. GET /virtual-bank-account/transactions`);
  const listed = await call(
    `/virtual-bank-account/transactions?account_number=${account.account_number}&limit=20`,
  );
  const transactions = Array.isArray(listed.json?.data)
    ? listed.json.data
    : (listed.json?.data?.transactions ?? []);
  console.error(`   HTTP ${listed.status}, ${transactions.length} transaction(s)`);
  for (const t of transactions) {
    console.error(`     ${t.status}  ${t.currency} ${t.amount}  fee=${t.fee}  ref=${t.reference}`);
  }

  console.error(`\n4. settleKorapayCharge against each successful one (in-memory double)`);
  for (const t of transactions) {
    if (t.status !== "success" || !t.reference) continue;
    const charge = await call(`/charges/${encodeURIComponent(t.reference)}`);
    if (!charge.ok || charge.json?.status === false) {
      console.error(`   GET /charges/${t.reference} → HTTP ${charge.status} ${charge.json?.message ?? ""}`);
      continue;
    }
    const c = charge.json.data;
    const accountNumber =
      c.virtual_bank_account?.account_number ?? c.virtual_bank_account_details?.account_number ?? null;
    console.error(
      `   charge ${c.reference}: status=${c.status} currency=${c.currency} amount=${c.amount} fee=${c.fee} account=${accountNumber ?? "(none)"}`,
    );

    const credits = [];
    const outcome = await settleKorapayCharge(
      {
        async getCharge() {
          return {
            reference: c.reference,
            status: c.status,
            currency: c.currency,
            amount: c.amount,
            fee: c.fee,
            accountNumber,
          };
        },
        async findAccountByNumber(n) {
          return n === account.account_number ? { id: "sbx-account", userId: "sbx-user" } : null;
        },
        async credit(input) {
          credits.push(input);
          return { result: "credited" };
        },
        async notify() {},
        log: (level, message, detail) => console.error(`     [${level}] ${message}`, detail),
      },
      c.reference,
    );
    console.error(`   → outcome: ${outcome}; credit call: ${JSON.stringify(credits[0] ?? null)}`);
  }

  console.error(`\nDone. Sandbox account ${account.account_number} remains at the provider.`);
} else if (step === "payout") {
  console.error("1. GET /balances (before)");
  const before = await call("/balances");
  console.error(`   NGN available=${before.json?.data?.NGN?.available_balance}`);

  console.error(`\n2. POST /misc/banks/resolve  ${SANDBOX_PAYOUT_BANK}/${SANDBOX_PAYOUT_ACCOUNT}`);
  const resolved = await call("/misc/banks/resolve", {
    method: "POST",
    auth: "public",
    body: { bank: SANDBOX_PAYOUT_BANK, account: SANDBOX_PAYOUT_ACCOUNT },
  });
  console.error(
    resolved.ok && resolved.json?.status !== false
      ? `   PASS "${resolved.json?.data?.account_name}"`
      : `   HTTP ${resolved.status}  ${resolved.json?.message ?? resolved.raw}`,
  );

  const reference = `jp_sbx_payout_${Date.now()}`;
  console.error(`\n3. POST /transactions/disburse  NGN 1500, reference ${reference}`);
  const disbursed = await call("/transactions/disburse", {
    method: "POST",
    body: {
      reference,
      destination: {
        type: "bank_account",
        amount: "1500",
        currency: "NGN",
        narration: "justpae sandbox payout",
        bank_account: { bank: SANDBOX_PAYOUT_BANK, account: SANDBOX_PAYOUT_ACCOUNT },
        customer: { name: "Sandbox Tester", email: "sandbox.tester@example.com" },
      },
    },
  });
  console.error(
    disbursed.ok && disbursed.json?.status !== false
      ? `   PASS status=${disbursed.json?.data?.status} fee=${disbursed.json?.data?.fee}`
      : `   HTTP ${disbursed.status}  ${disbursed.json?.message ?? disbursed.raw}`,
  );

  console.error(`\n4. POST /transactions/disburse again, SAME reference (never pay twice)`);
  const again = await call("/transactions/disburse", {
    method: "POST",
    body: {
      reference,
      destination: {
        type: "bank_account",
        amount: "1500",
        currency: "NGN",
        narration: "justpae sandbox payout",
        bank_account: { bank: SANDBOX_PAYOUT_BANK, account: SANDBOX_PAYOUT_ACCOUNT },
        customer: { name: "Sandbox Tester", email: "sandbox.tester@example.com" },
      },
    },
  });
  console.error(`   HTTP ${again.status}  ${again.json?.message ?? again.raw}`);

  console.error(`\n5. GET /transactions/${reference}`);
  const queried = await call(`/transactions/${encodeURIComponent(reference)}`);
  console.error(
    `   HTTP ${queried.status}  ${JSON.stringify(queried.json?.data ?? queried.json?.message)}`,
  );

  console.error("\n6. GET /balances (after)");
  const after = await call("/balances");
  console.error(`   NGN available=${after.json?.data?.NGN?.available_balance}`);
} else {
  console.error("Usage: korapay-sandbox-exercise.mjs <deposit|payout>");
  process.exit(1);
}

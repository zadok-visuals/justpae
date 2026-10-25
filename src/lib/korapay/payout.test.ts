import { test } from "node:test";
import assert from "node:assert/strict";
import {
  korapayDestinationFor,
  payoutBalanceHoldReason,
  payoutBalanceTooLow,
  resolvedNameMatches,
  runKorapayPayout,
  settleKorapayPayout,
  type KorapayPayoutDeps,
  type PayoutQueryResult,
  type PayoutRecipient,
  type SettlePayoutDeps,
} from "./payout.ts";

/**
 * GROUP 3e. The rules a payout has to get right, each of which is either
 * silent in production or expensive.
 *
 * The harness counts DISBURSE CALLS, because every double-payment bug in
 * this file's history looks the same from the outside: the row ends up
 * correct and the provider was asked twice.
 */

const OPERATORS = [
  { slug: "safaricom-ke", name: "SAFARICOM" },
  { slug: "airtel-ke", name: "AIRTEL" },
];

function ngnRecipient(over: Partial<PayoutRecipient> = {}): PayoutRecipient {
  return {
    account_holder_name: "Chidi Okeke",
    bank_account_number: "0123456789",
    bank_name: "Test Bank",
    bank_code: "033",
    ...over,
  };
}

function harness(
  options: {
    balance?: number | null;
    balanceThrows?: boolean;
    resolvedName?: string;
    claimable?: boolean;
    disburseStatus?: string;
    disburseThrows?: Error;
    query?: PayoutQueryResult;
    queryThrows?: boolean;
    firstHold?: boolean;
  } = {},
) {
  const calls = {
    disburses: 0,
    queries: 0,
    completes: 0,
    fails: [] as string[],
    holds: [] as string[],
    emails: [] as string[],
    failures: [] as string[],
    releases: [] as string[],
    notifiedCompleted: 0,
  };

  let claimed = false;

  const deps: KorapayPayoutDeps = {
    async availableBalance() {
      if (options.balanceThrows) throw new Error("balance endpoint down");
      return options.balance === undefined ? 1_000_000 : options.balance;
    },
    async mobileMoneyOperators() {
      return OPERATORS;
    },
    async resolveAccountName() {
      return options.resolvedName ?? "OKEKE CHIDI";
    },
    async claim() {
      if (options.claimable === false) return false;
      // The database's rule, reproduced: the row flips once.
      if (claimed) return false;
      claimed = true;
      return true;
    },
    async disburse() {
      calls.disburses += 1;
      if (options.disburseThrows) throw options.disburseThrows;
      return { status: options.disburseStatus ?? "success" };
    },
    async query() {
      calls.queries += 1;
      if (options.queryThrows) throw new Error("query failed too");
      return options.query ?? { status: "success", found: true };
    },
    async holdForBalance(reason) {
      calls.holds.push(reason);
      return options.firstHold ?? true;
    },
    async emailAdminsAboutBalance(reason) {
      calls.emails.push(reason);
    },
    async recordFailure(reason) {
      calls.failures.push(reason);
    },
    async releaseClaim(_reference, reason) {
      calls.releases.push(reason);
    },
    async complete() {
      calls.completes += 1;
    },
    async fail(reason) {
      calls.fails.push(reason);
    },
    async notifyCompleted() {
      calls.notifiedCompleted += 1;
    },
    async notifyFailed() {},
    log: () => {},
  };

  return { deps, calls };
}

const NGN_INPUT = {
  reference: "tx-1",
  currency: "NGN",
  amount: 5000,
  recipient: ngnRecipient(),
  customerName: "Chidi Okeke",
};

// ── Routing ────────────────────────────────────────────────────────────────

test("a naira payout goes to a bank account", () => {
  const routed = korapayDestinationFor("NGN", ngnRecipient(), []);
  assert.deepEqual(routed, {
    destination: { type: "bank", bankCode: "033", accountNumber: "0123456789" },
  });
});

test("a shilling payout with no bank code goes to M-Pesa, with a slug from the live list", () => {
  const routed = korapayDestinationFor(
    "KES",
    { account_holder_name: "A B", bank_account_number: "0712345678", bank_name: null, bank_code: null },
    OPERATORS,
  );
  assert.deepEqual(routed, {
    destination: { type: "mobile_money", operatorSlug: "safaricom-ke", phoneNumber: "0712345678" },
  });
});

test("a shilling payout names the operator the recipient actually uses", () => {
  const routed = korapayDestinationFor(
    "KES",
    { account_holder_name: "A B", bank_account_number: "0733000000", bank_name: "Airtel", bank_code: null },
    OPERATORS,
  );
  assert.deepEqual(routed, {
    destination: { type: "mobile_money", operatorSlug: "airtel-ke", phoneNumber: "0733000000" },
  });
});

test("a shilling payout with a bank code goes to the bank, not to mobile money", () => {
  const routed = korapayDestinationFor(
    "KES",
    { account_holder_name: "A B", bank_account_number: "1234567", bank_name: "KCB", bank_code: "68" },
    OPERATORS,
  );
  assert.deepEqual(routed, {
    destination: { type: "bank", bankCode: "68", accountNumber: "1234567" },
  });
});

test("the cedi stays locked — it has no destination here at all", () => {
  const routed = korapayDestinationFor("GHS", ngnRecipient(), OPERATORS);
  assert.ok("error" in routed);
});

test("an operator list with nothing usable is an error, never a guessed slug", () => {
  const routed = korapayDestinationFor(
    "KES",
    { account_holder_name: "A B", bank_account_number: "0712345678", bank_name: null, bank_code: null },
    [],
  );
  assert.ok("error" in routed);
});

// ── The name check ─────────────────────────────────────────────────────────

test("a bank's reordering of the same name matches", () => {
  assert.equal(resolvedNameMatches("Chidi Okeke", "OKEKE CHIDI"), true);
  assert.equal(resolvedNameMatches("Chidi Emeka Okeke", "OKEKE CHIDI E"), true);
});

test("a different person does not match", () => {
  assert.equal(resolvedNameMatches("Chidi Okeke", "ADAEZE NWANKWO"), false);
  assert.equal(resolvedNameMatches("Chidi Okeke", ""), false);
});

// ── The balance gate ───────────────────────────────────────────────────────

test("a short balance is short; an unreadable one is not", () => {
  assert.equal(payoutBalanceTooLow(100, 5000), true);
  assert.equal(payoutBalanceTooLow(5000, 5000), false);
  // Unknown must not freeze every payout in the system.
  assert.equal(payoutBalanceTooLow(null, 5000), false);
});

test("a short balance holds the withdrawal and never calls the provider", async () => {
  const { deps, calls } = harness({ balance: 100 });
  const outcome = await runKorapayPayout(deps, NGN_INPUT);

  assert.equal(outcome, "balance_held");
  assert.equal(calls.disburses, 0);
  assert.deepEqual(calls.holds, [payoutBalanceHoldReason("NGN")]);
  assert.deepEqual(calls.emails, [payoutBalanceHoldReason("NGN")]);
});

test("admins are emailed once per withdrawal, not once per retry", async () => {
  const { deps, calls } = harness({ balance: 100, firstHold: false });
  await runKorapayPayout(deps, NGN_INPUT);

  assert.equal(calls.holds.length, 1);
  assert.equal(calls.emails.length, 0);
});

test("a balance read that throws lets the payout through", async () => {
  const { deps, calls } = harness({ balanceThrows: true });
  const outcome = await runKorapayPayout(deps, NGN_INPUT);

  assert.equal(outcome, "paid");
  assert.equal(calls.disburses, 1);
});

// ── The name check, in the payout path ─────────────────────────────────────

test("a payout account in someone else's name is refused before the provider is called", async () => {
  const { deps, calls } = harness({ resolvedName: "ADAEZE NWANKWO" });
  const outcome = await runKorapayPayout(deps, NGN_INPUT);

  assert.equal(outcome, "name_mismatch");
  assert.equal(calls.disburses, 0);
  assert.equal(calls.failures.length, 1);
});

// ── Never pay twice ────────────────────────────────────────────────────────

test("a withdrawal another attempt already claimed is not sent again", async () => {
  const { deps, calls } = harness({ claimable: false });
  const outcome = await runKorapayPayout(deps, NGN_INPUT);

  assert.equal(outcome, "not_claimed");
  assert.equal(calls.disburses, 0);
});

test("two attempts on one withdrawal produce exactly one disbursement", async () => {
  const { deps, calls } = harness();
  await runKorapayPayout(deps, NGN_INPUT);
  const second = await runKorapayPayout(deps, NGN_INPUT);

  assert.equal(second, "not_claimed");
  assert.equal(calls.disburses, 1);
  assert.equal(calls.completes, 1);
});

test("a timeout queries the payout instead of sending it again", async () => {
  const { deps, calls } = harness({
    disburseThrows: new Error("Korapay request did not complete (timeout)"),
    query: { status: "success", found: true },
  });
  const outcome = await runKorapayPayout(deps, NGN_INPUT);

  assert.equal(outcome, "paid");
  assert.equal(calls.disburses, 1);
  assert.equal(calls.queries, 1);
  assert.equal(calls.completes, 1);
  // Nothing was refunded: the money went out.
  assert.deepEqual(calls.fails, []);
});

test("a timeout whose query also fails leaves the money held, not refunded", async () => {
  const { deps, calls } = harness({
    disburseThrows: new Error("Korapay request did not complete (timeout)"),
    queryThrows: true,
  });
  const outcome = await runKorapayPayout(deps, NGN_INPUT);

  assert.equal(outcome, "pending");
  assert.deepEqual(calls.fails, []);
  assert.deepEqual(calls.releases, []);
});

test("a rejection the provider has no record of hands the claim back", async () => {
  const { deps, calls } = harness({
    disburseThrows: new Error("Insufficient balance"),
    query: { status: "not_found", found: false },
  });
  const outcome = await runKorapayPayout(deps, NGN_INPUT);

  assert.equal(outcome, "released");
  assert.equal(calls.releases.length, 1);
  // The wallet is NOT refunded here — the withdrawal goes back in the queue.
  assert.deepEqual(calls.fails, []);
});

test("a payout the provider reports as failed refunds the wallet", async () => {
  const { deps, calls } = harness({ disburseStatus: "failed" });
  const outcome = await runKorapayPayout(deps, NGN_INPUT);

  assert.equal(outcome, "failed");
  assert.deepEqual(calls.fails, ["Payout failed"]);
  assert.equal(calls.completes, 0);
});

test("a payout still in flight is left for the webhook or the cron", async () => {
  const { deps, calls } = harness({ disburseStatus: "processing" });
  const outcome = await runKorapayPayout(deps, NGN_INPUT);

  assert.equal(outcome, "pending");
  assert.equal(calls.completes, 0);
  assert.deepEqual(calls.fails, []);
});

// ── Settling: the webhook and the reconcile cron ───────────────────────────

function settleHarness(
  options: { row?: { id: string; status: string } | null; query?: PayoutQueryResult } = {},
) {
  const calls = { queries: 0, completed: [] as string[], failed: [] as string[], notified: 0 };

  const deps: SettlePayoutDeps = {
    async query() {
      calls.queries += 1;
      return options.query ?? { status: "success", found: true };
    },
    async findWithdrawalByReference() {
      return options.row === undefined ? { id: "tx-1", status: "processing" } : options.row;
    },
    async complete(id) {
      calls.completed.push(id);
    },
    async fail(id, reason) {
      calls.failed.push(`${id}:${reason}`);
    },
    async notifyCompleted() {
      calls.notified += 1;
    },
    async notifyFailed() {},
    log: () => {},
  };

  return { deps, calls };
}

test("a transfer.success completes the withdrawal, from the query and not the payload", async () => {
  const { deps, calls } = settleHarness();
  assert.equal(await settleKorapayPayout(deps, "tx-1"), "completed");
  assert.equal(calls.queries, 1);
  assert.deepEqual(calls.completed, ["tx-1"]);
  assert.equal(calls.notified, 1);
});

test("a transfer.failed whose query says success does NOT refund", async () => {
  // The whole reason the payload is never acted on: a stale or replayed
  // failure delivery must not take money back out of a paid customer.
  const { deps, calls } = settleHarness({ query: { status: "success", found: true } });
  assert.equal(await settleKorapayPayout(deps, "tx-1"), "completed");
  assert.deepEqual(calls.failed, []);
});

test("a payout the provider reports failed refunds once", async () => {
  const { deps, calls } = settleHarness({ query: { status: "failed", found: true } });
  assert.equal(await settleKorapayPayout(deps, "tx-1"), "failed");
  assert.deepEqual(calls.failed, ["tx-1:Payout failed"]);
});

test("a reference with no withdrawal behind it changes nothing", async () => {
  const { deps, calls } = settleHarness({ row: null });
  assert.equal(await settleKorapayPayout(deps, "who-knows"), "unknown_reference");
  assert.equal(calls.queries, 0);
});

test("a withdrawal that already completed is left alone", async () => {
  const { deps, calls } = settleHarness({ row: { id: "tx-1", status: "completed" } });
  assert.equal(await settleKorapayPayout(deps, "tx-1"), "already_settled");
  assert.equal(calls.queries, 0);
  assert.deepEqual(calls.completed, []);
});

test("a reference the provider cannot find keeps the hold rather than refunding", async () => {
  const { deps, calls } = settleHarness({ query: { status: "not_found", found: false } });
  assert.equal(await settleKorapayPayout(deps, "tx-1"), "still_pending");
  assert.deepEqual(calls.failed, []);
  assert.deepEqual(calls.completed, []);
});

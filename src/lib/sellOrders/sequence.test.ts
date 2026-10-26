import { test } from "node:test";
import assert from "node:assert/strict";
import { settleSellOrder, type SellOrderClaim, type SellOrderSteps } from "./sequence.ts";

/**
 * GROUP — sell orders. Fakes throughout, same style as
 * src/lib/convert/sequence.test.ts: the thing under test is the ORDER these
 * steps run in and what each outcome does to the others, not any real
 * database or provider call.
 */

const RECEIVED_CLAIM: SellOrderClaim = {
  sellOrderId: "order-1",
  userId: "user-1",
  targetCurrency: "NGN",
  receivedAmount: 123.45,
  flagged: false,
  status: "received",
  holdId: "hold-1",
};

function fakeSteps(overrides: Partial<SellOrderSteps<{ status: string }>> = {}) {
  const calls = {
    claim: 0,
    quoteAndTransfer: [] as number[],
    settle: 0,
    completeConversion: 0,
    creditUsdtFallback: 0,
    notifyCreditedUsdt: 0,
    notifySold: 0,
  };

  const steps: SellOrderSteps<{ status: string }> = {
    claim: async () => {
      calls.claim += 1;
      return RECEIVED_CLAIM;
    },
    quoteAndTransfer: async (claim) => {
      calls.quoteAndTransfer.push(claim.receivedAmount);
      return {
        transfer: { status: "funds_delivered" },
        delivered: true,
        targetAmount: 1000,
        providerReference: "ref-1",
        providerRate: 1500,
        markupRate: 0.01,
        customerRate: 1485,
      };
    },
    settle: async () => {
      calls.settle += 1;
      return "tx-1";
    },
    completeConversion: async () => {
      calls.completeConversion += 1;
    },
    creditUsdtFallback: async () => {
      calls.creditUsdtFallback += 1;
    },
    notifyCreditedUsdt: async () => {
      calls.notifyCreditedUsdt += 1;
    },
    notifySold: async () => {
      calls.notifySold += 1;
    },
    ...overrides,
  };

  return { steps, calls };
}

test("a claimed, received order sells and completes when delivered", async () => {
  const { steps, calls } = fakeSteps();
  const outcome = await settleSellOrder(steps);

  assert.deepEqual(outcome, { status: "sold", transactionId: "tx-1", delivered: true });
  assert.equal(calls.settle, 1);
  assert.equal(calls.completeConversion, 1);
  assert.equal(calls.notifySold, 1);
  assert.equal(calls.creditUsdtFallback, 0);
});

test("nothing linked to this deposit (or already claimed) does nothing at all", async () => {
  const { steps, calls } = fakeSteps({ claim: async () => null });
  const outcome = await settleSellOrder(steps);

  assert.deepEqual(outcome, { status: "skipped" });
  assert.equal(calls.quoteAndTransfer.length, 0);
  assert.equal(calls.settle, 0);
  assert.equal(calls.notifyCreditedUsdt, 0);
});

/**
 * THE idempotency property. The webhook and the reconcile cron can both
 * reach this sequence for the same deposit; claim_sell_order_for_deposit is
 * what makes the second call return null, and this is the proof that a null
 * claim sells nothing a second time.
 */
test("a sale happens once even if the webhook and reconcile both fire", async () => {
  let claimCalls = 0;
  const { steps, calls } = fakeSteps({
    claim: async () => {
      claimCalls += 1;
      // First caller claims the order; the second finds it already moved on.
      return claimCalls === 1 ? RECEIVED_CLAIM : null;
    },
  });

  const first = await settleSellOrder(steps);
  const second = await settleSellOrder(steps);

  assert.equal(first.status, "sold");
  assert.deepEqual(second, { status: "skipped" });
  assert.equal(calls.quoteAndTransfer.length, 1, "the provider must be called exactly once");
  assert.equal(calls.settle, 1);
});

test("the received amount prices the sale, never the amount the order expected", async () => {
  const { steps, calls } = fakeSteps({
    claim: async () => ({ ...RECEIVED_CLAIM, receivedAmount: 987.65 }),
  });

  await settleSellOrder(steps);

  assert.deepEqual(calls.quoteAndTransfer, [987.65]);
});

test("a mismatch over 10% is flagged but still sells", async () => {
  const { steps, calls } = fakeSteps({
    claim: async () => ({ ...RECEIVED_CLAIM, flagged: true }),
  });

  const outcome = await settleSellOrder(steps);

  assert.equal(outcome.status, "sold");
  assert.equal(calls.settle, 1, "flagging must never block the sale");
});

test("a failed sale credits USDT back and notifies — never settles, never completes", async () => {
  const { steps, calls } = fakeSteps({
    quoteAndTransfer: async () => {
      throw new Error("provider minimum not met");
    },
  });

  const outcome = await settleSellOrder(steps);

  assert.deepEqual(outcome, { status: "credited_usdt" });
  assert.equal(calls.creditUsdtFallback, 1);
  assert.equal(calls.notifyCreditedUsdt, 1);
  assert.equal(calls.settle, 0);
  assert.equal(calls.completeConversion, 0);
  assert.equal(calls.notifySold, 0);
});

/**
 * The provider executed but has not confirmed delivery yet. The USDT is
 * already gone at the provider's end — crediting it back here would be the
 * business paying twice — so the row must settle (pending) and must NOT
 * fall back, even though nothing has landed in the fiat wallet yet.
 */
test("a transfer that executed but is not yet delivered still settles — it must never fall back", async () => {
  const { steps, calls } = fakeSteps({
    quoteAndTransfer: async () => ({
      transfer: { status: "pending" },
      delivered: false,
      targetAmount: 1000,
      providerReference: "ref-2",
      providerRate: 1500,
      markupRate: 0.01,
      customerRate: 1485,
    }),
  });

  const outcome = await settleSellOrder(steps);

  assert.deepEqual(outcome, { status: "sold", transactionId: "tx-1", delivered: false });
  assert.equal(calls.settle, 1);
  assert.equal(calls.completeConversion, 0, "only an immediately-delivered transfer completes here");
  assert.equal(calls.notifySold, 0);
  assert.equal(calls.creditUsdtFallback, 0);
});

test("an order the database already resolved (suspended, or insufficient balance) is only notified, never sold", async () => {
  const { steps, calls } = fakeSteps({
    claim: async () => ({ ...RECEIVED_CLAIM, status: "credited_usdt" }),
  });

  const outcome = await settleSellOrder(steps);

  assert.deepEqual(outcome, { status: "credited_usdt" });
  assert.equal(calls.quoteAndTransfer.length, 0);
  assert.equal(calls.notifyCreditedUsdt, 1);
});

/**
 * GROUP — no code path in this module can reach a bank, a recipient or a
 * withdrawal. The whole point of /sell is that the fiat only ever lands in
 * the customer's own wallet; this reads the source rather than the type,
 * because a future edit that quietly adds a withdrawal call would not
 * otherwise fail anything here.
 */
test("no code path sends sell proceeds anywhere except the user's own wallet", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./sequence.ts", import.meta.url), "utf8");
  for (const forbidden of ["requestWithdrawal", "withdrawal_recipients", "bank_account", "payout"]) {
    assert.ok(!source.includes(forbidden), `sequence.ts must not reference "${forbidden}"`);
  }
});

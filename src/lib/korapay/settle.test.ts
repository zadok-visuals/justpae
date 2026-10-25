import { test } from "node:test";
import assert from "node:assert/strict";
import { korapaySignature, verifyKorapaySignature } from "./signature.ts";
import { virtualAccountGate } from "./accountGate.ts";
import {
  settleKorapayCharge,
  type CreditResult,
  type SettleCharge,
  type SettleDeps,
} from "./settle.ts";

/**
 * GROUP 2f. The six behaviours a virtual-account deposit has to get right,
 * every one of which fails silently in production and loudly here.
 *
 * The fake `credit` below implements the REAL idempotency rule — one credit
 * per reference, enforced by a set — because that is what the unique index in
 * migration 0040 does. Every test that cares about double-crediting leans on
 * it, so a change to this harness that weakened it would make those tests
 * meaningless; it is written once, here, for that reason.
 */

const SECRET = "sk_test_not_a_real_key_0000000000";

function fakeCharge(over: Partial<SettleCharge> = {}): SettleCharge {
  return {
    reference: "KPY-PAY-TEST-1",
    status: "success",
    currency: "NGN",
    amount: "5000.00",
    fee: "50.00",
    accountNumber: "1110036920",
    ...over,
  };
}

/** A whole fake world: one account, one ledger, one notification log. */
function harness(options: { charge?: SettleCharge; knownAccount?: boolean } = {}) {
  const charge = options.charge ?? fakeCharge();
  const credits: { reference: string; grossAmount: number; providerFee: number }[] = [];
  const creditedReferences = new Set<string>();
  const notifications: string[] = [];
  let chargeQueries = 0;

  const deps: SettleDeps = {
    async getCharge(reference) {
      chargeQueries += 1;
      return { ...charge, reference };
    },
    async findAccountByNumber(accountNumber) {
      if (options.knownAccount === false) return null;
      return accountNumber === charge.accountNumber
        ? { id: "va_1", userId: "user_1" }
        : null;
    },
    async credit(input) {
      // The database's rule, reproduced: the unique index on
      // (provider, provider_reference) means the second insert writes nothing.
      if (creditedReferences.has(input.reference)) {
        return { result: "already_credited" as CreditResult };
      }
      creditedReferences.add(input.reference);
      credits.push({
        reference: input.reference,
        grossAmount: input.grossAmount,
        providerFee: input.providerFee,
      });
      return { result: "credited" as CreditResult };
    },
    async notify(reference) {
      notifications.push(reference);
    },
    log() {},
  };

  return { deps, credits, notifications, chargeQueries: () => chargeQueries };
}

// ── 1. The signature ──────────────────────────────────────────────────────

test("a correctly signed delivery verifies", () => {
  const data = { reference: "KPY-PAY-TEST-1", status: "success", amount: "5000.00" };
  assert.equal(verifyKorapaySignature(data, korapaySignature(data, SECRET), SECRET), true);
});

test("every way of getting the signature wrong is refused", () => {
  const data = { reference: "KPY-PAY-TEST-1", status: "success", amount: "5000.00" };
  const good = korapaySignature(data, SECRET);

  // A different key.
  assert.equal(verifyKorapaySignature(data, korapaySignature(data, "other"), SECRET), false);
  // A tampered body under a signature for the original. This is the attack:
  // the amount is the field worth changing.
  assert.equal(verifyKorapaySignature({ ...data, amount: "500000.00" }, good, SECRET), false);
  // No header at all.
  assert.equal(verifyKorapaySignature(data, null, SECRET), false);
  assert.equal(verifyKorapaySignature(data, "", SECRET), false);
  // A header of the wrong length must return false, NOT throw —
  // timingSafeEqual throws on a length mismatch, and a throw in the route is
  // a 500, which the provider reads as "retry".
  assert.equal(verifyKorapaySignature(data, "abc", SECRET), false);
  assert.equal(verifyKorapaySignature(data, good + "00", SECRET), false);
  // A single flipped character, at the same length.
  const flipped = (good[0] === "a" ? "b" : "a") + good.slice(1);
  assert.equal(verifyKorapaySignature(data, flipped, SECRET), false);
});

test("a receiver with no secret configured verifies nothing", () => {
  // The opposite of the Busha receiver's default, deliberately: a receiver
  // that CANNOT check must not accept. See signature.ts.
  const data = { reference: "x" };
  assert.equal(verifyKorapaySignature(data, korapaySignature(data, SECRET), undefined), false);
  assert.equal(verifyKorapaySignature(data, "anything", ""), false);
});

test("the signature covers data, not the envelope", () => {
  // Signing the whole payload instead of payload.data is the natural mistake
  // and would reject every real delivery.
  const data = { reference: "r", amount: "100" };
  const envelope = { event: "charge.success", data };
  assert.notEqual(korapaySignature(data, SECRET), korapaySignature(envelope, SECRET));
});

// ── 2. A duplicate webhook credits once ───────────────────────────────────

test("the same delivery twice credits once and notifies once", async () => {
  const h = harness();

  assert.equal(await settleKorapayCharge(h.deps, "KPY-PAY-TEST-1"), "credited");
  assert.equal(await settleKorapayCharge(h.deps, "KPY-PAY-TEST-1"), "already_credited");

  assert.equal(h.credits.length, 1, "the wallet moved twice");
  assert.equal(h.notifications.length, 1, "the customer was told twice");
});

// ── 3. The queried amount wins over the payload's ─────────────────────────

test("a payload that disagrees with the charge cannot change what is credited", async () => {
  // THE ATTACK THIS CLOSES: anybody who learns a reference could POST a
  // correctly shaped body claiming a far larger amount. Nothing from the body
  // reaches the credit — settleKorapayCharge takes only a reference, and the
  // amount comes from getCharge. That is asserted by construction here: the
  // function has no parameter a payload amount could be passed through.
  const h = harness({ charge: fakeCharge({ amount: "5000.00", fee: "50.00" }) });

  await settleKorapayCharge(h.deps, "KPY-PAY-TEST-1");

  assert.equal(h.credits.length, 1);
  assert.equal(h.credits[0].grossAmount, 5000, "credited something other than the queried amount");
  assert.equal(h.credits[0].providerFee, 50);
  assert.equal(h.chargeQueries(), 1, "the charge was not re-queried at all");
});

test("a charge the provider does not call successful credits nothing", async () => {
  for (const status of ["pending", "processing", "failed", "expired"]) {
    const h = harness({ charge: fakeCharge({ status }) });
    assert.equal(await settleKorapayCharge(h.deps, "KPY-PAY-TEST-1"), "not_success", status);
    assert.equal(h.credits.length, 0, status);
  }
});

test("a charge in another currency credits nothing", async () => {
  // Crediting a KES arrival into a naira wallet is never a self-correction.
  const h = harness({ charge: fakeCharge({ currency: "KES" }) });
  assert.equal(await settleKorapayCharge(h.deps, "KPY-PAY-TEST-1"), "wrong_currency");
  assert.equal(h.credits.length, 0);
});

test("an amount that is missing, zero or negative credits nothing", async () => {
  for (const amount of ["0", "-100", "", "not a number"]) {
    const h = harness({ charge: fakeCharge({ amount }) });
    assert.equal(
      await settleKorapayCharge(h.deps, "KPY-PAY-TEST-1"),
      "unusable_amount",
      JSON.stringify(amount),
    );
    assert.equal(h.credits.length, 0);
  }
});

// ── 4. An unknown account is ignored ──────────────────────────────────────

test("a charge against an account we did not issue is ignored, not guessed at", async () => {
  const h = harness({ knownAccount: false });
  assert.equal(await settleKorapayCharge(h.deps, "KPY-PAY-TEST-1"), "unknown_account");
  assert.equal(h.credits.length, 0, "credited a wallet with no owner");
  assert.equal(h.notifications.length, 0);
});

test("a charge carrying no account number at all is ignored", async () => {
  const h = harness({ charge: fakeCharge({ accountNumber: null }) });
  assert.equal(await settleKorapayCharge(h.deps, "KPY-PAY-TEST-1"), "no_account_number");
  assert.equal(h.credits.length, 0);
});

test("a provider lookup that fails does nothing and leaves it for the cron", async () => {
  const h = harness();
  const deps: SettleDeps = {
    ...h.deps,
    async getCharge() {
      throw new Error("socket hang up");
    },
  };
  assert.equal(await settleKorapayCharge(deps, "KPY-PAY-TEST-1"), "lookup_failed");
  assert.equal(h.credits.length, 0);
});

test("a credit that errors does not notify the customer", async () => {
  // The message says the money is in the wallet. Sending it when the credit
  // failed is worse than sending nothing.
  const h = harness();
  const deps: SettleDeps = {
    ...h.deps,
    async credit() {
      return { error: "deadlock detected" };
    },
  };
  assert.equal(await settleKorapayCharge(deps, "KPY-PAY-TEST-1"), "credit_failed");
  assert.equal(h.notifications.length, 0);
});

test("an arrival below the deposit fee credits nothing and says nothing", async () => {
  const h = harness();
  const deps: SettleDeps = {
    ...h.deps,
    async credit() {
      return { result: "below_fee" as CreditResult };
    },
  };
  assert.equal(await settleKorapayCharge(deps, "KPY-PAY-TEST-1"), "below_fee");
  assert.equal(h.notifications.length, 0);
});

// ── 5. No KYC means no account ────────────────────────────────────────────

test("the gates are asked in an order that cannot issue to an unverified user", () => {
  for (const kycStatus of ["not_started", "pending", "rejected", null, undefined]) {
    assert.deepEqual(
      virtualAccountGate({ hasAccount: false, kycStatus, country: "NG", hasBvn: true }),
      { state: "needs_kyc" },
      String(kycStatus),
    );
  }

  // Approved but no BVN: asked for it, not issued an account.
  assert.deepEqual(
    virtualAccountGate({ hasAccount: false, kycStatus: "approved", country: "NG", hasBvn: false }),
    { state: "needs_bvn" },
  );

  // Approved, Nigerian, BVN on file: the only input that issues one.
  assert.deepEqual(
    virtualAccountGate({ hasAccount: false, kycStatus: "approved", country: "NG", hasBvn: true }),
    { state: "none" },
  );

  // Not Nigerian: no naira account number, however verified they are.
  for (const country of ["GH", "KE", "US", null]) {
    assert.deepEqual(
      virtualAccountGate({ hasAccount: false, kycStatus: "approved", country, hasBvn: true }),
      { state: "wrong_country" },
      String(country),
    );
  }
});

test("an already-issued account survives every later gate", () => {
  // They may have it saved in their bank app with money on the way. Hiding it
  // because a review moved them back to pending hides a live destination.
  assert.deepEqual(
    virtualAccountGate({
      hasAccount: true,
      kycStatus: "pending",
      country: "NG",
      hasBvn: false,
    }),
    { state: "ready" },
  );
});

// ── 6. Reconcile and the webhook together ─────────────────────────────────

test("the cron and the webhook racing on one payment credit once", async () => {
  // The real shape of the sandbox today: no webhook is delivered, the cron
  // credits, and then a delivery arrives later. And the shape of production:
  // the webhook credits and the cron sweeps past it afterwards. Both
  // orderings, plus the simultaneous case, over ONE harness — because the
  // two call the same settleKorapayCharge against the same database rule.
  const h = harness();

  // Cron first, webhook second.
  assert.equal(await settleKorapayCharge(h.deps, "KPY-PAY-TEST-1"), "credited");
  assert.equal(await settleKorapayCharge(h.deps, "KPY-PAY-TEST-1"), "already_credited");

  // And at the same instant, on a second payment.
  const [a, b] = await Promise.all([
    settleKorapayCharge(h.deps, "KPY-PAY-TEST-2"),
    settleKorapayCharge(h.deps, "KPY-PAY-TEST-2"),
  ]);
  assert.deepEqual([a, b].filter((o) => o === "credited").length, 1, "both racers credited");

  assert.equal(h.credits.length, 2, "two payments produced more than two credits");
  assert.equal(h.notifications.length, 2);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { runConversion, type ConversionSteps, type StepResult } from "./sequence.ts";

/**
 * The three tests Group 1a asks for, plus the two that stop the fix rotting.
 *
 * These assert on CALL COUNTS, not on amounts. That is deliberate: the bug
 * being guarded against is "the provider was called when it should not have
 * been", and the only evidence of it is that the call happened at all.
 */

interface Spy {
  providerCalls: number;
  releases: { holdId: string; reason: string }[];
  settles: number;
  quotes: number;
}

/**
 * A set of steps where everything succeeds, and a record of what got called.
 * Each test overrides exactly the one step it is about.
 */
function steps(overrides: Partial<ConversionSteps<string, string>> = {}): {
  steps: ConversionSteps<string, string>;
  spy: Spy;
} {
  const spy: Spy = { providerCalls: 0, releases: [], settles: 0, quotes: 0 };

  const base: ConversionSteps<string, string> = {
    beginHold: async () => ok("hold-1"),
    callProvider: async () => {
      spy.providerCalls += 1;
      return "transfer-1";
    },
    writeQuote: async () => {
      spy.quotes += 1;
      return ok("quote-1");
    },
    settle: async () => {
      spy.settles += 1;
      return ok("txn-1");
    },
    release: async (holdId, reason) => {
      spy.releases.push({ holdId, reason });
    },
    describeProviderError: (err) => (err instanceof Error ? err.message : "Provider failed"),
  };

  return { steps: { ...base, ...overrides }, spy };
}

function ok<T>(value: T): StepResult<T> {
  return { ok: true, value };
}

function fail(error: string, isPinError = false): StepResult<never> {
  return { ok: false, error, isPinError };
}

// ── The three Group 1a tests ───────────────────────────────────────────────

test("a wrong PIN makes no provider call", async () => {
  const { steps: s, spy } = steps({
    beginHold: async () => fail("Incorrect transaction PIN", true),
  });

  const outcome = await runConversion(s);

  // The whole point. Before 0022 this was 1.
  assert.equal(spy.providerCalls, 0);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.failedAt, "hold");
  assert.equal(outcome.ok === false && outcome.isPinError, true);
  // Nothing was taken, so nothing is released — a release here would be a
  // credit with no matching debit.
  assert.deepEqual(spy.releases, []);
});

test("an insufficient balance makes no provider call", async () => {
  const { steps: s, spy } = steps({
    beginHold: async () => fail("Insufficient balance"),
  });

  const outcome = await runConversion(s);

  assert.equal(spy.providerCalls, 0);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.failedAt, "hold");
  assert.deepEqual(spy.releases, []);
});

test("a provider failure releases the hold", async () => {
  const { steps: s, spy } = steps({
    callProvider: async () => {
      spy.providerCalls += 1;
      throw new Error("Provider unavailable");
    },
  });

  const outcome = await runConversion(s);

  assert.equal(spy.providerCalls, 1);
  assert.equal(spy.releases.length, 1);
  assert.equal(spy.releases[0].holdId, "hold-1");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.failedAt, "provider");
  assert.equal(outcome.ok === false && outcome.released, true);
  // No ledger row for a transfer that never happened.
  assert.equal(spy.settles, 0);
});

// ── The two that stop it rotting ───────────────────────────────────────────

test("a failure AFTER the provider still releases the hold", async () => {
  // The tempting wrong answer is to treat this as unrecoverable and leave the
  // money held, because the provider-side movement cannot be undone. It can't
  // — but that is the business's problem, not the user's, and the user's
  // balance must come back either way.
  const { steps: s, spy } = steps({
    settle: async () => {
      spy.settles += 1;
      return fail("ledger write failed");
    },
  });

  const outcome = await runConversion(s);

  assert.equal(spy.providerCalls, 1);
  assert.equal(spy.settles, 1);
  assert.equal(spy.releases.length, 1);
  assert.equal(outcome.ok === false && outcome.failedAt, "settle");
  assert.equal(outcome.ok === false && outcome.released, true);
});

test("the happy path holds, calls the provider once, and never releases", async () => {
  const { steps: s, spy } = steps();

  const outcome = await runConversion(s);

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok === true && outcome.transactionId, "txn-1");
  assert.equal(spy.providerCalls, 1);
  assert.equal(spy.quotes, 1);
  assert.equal(spy.settles, 1);
  // A release on the success path would hand back money the conversion spent.
  assert.deepEqual(spy.releases, []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lagosClock,
  parseSweepTime,
  shouldSweepNow,
  sweepAmount,
  sweepPaused,
  sweepReference,
  type SweepSettings,
} from "./sweep.ts";
import { runSweep, type SweepDeps } from "./run.ts";
import { treasuryRows, treasuryWarnings } from "./position.ts";

/**
 * GROUP 4c. The four behaviours the brief names — the amount, the daily
 * maximum, the 24-hour pause and never sweeping twice — plus the warnings,
 * which are the only reason anybody opens the page.
 *
 * The fake record() below implements the REAL rule: one row per reference,
 * because that is what the unique index in migration 0042 does. Every test
 * about double-sweeping leans on it.
 */

function settings(over: Partial<SweepSettings> = {}): SweepSettings {
  return {
    minKeep: 500_000,
    target: 2_000_000,
    maxDaily: 1_000_000,
    timeLagos: "17:30",
    bankCode: "033",
    accountNumber: "0000000000",
    accountName: "justpae Funding",
    pausedUntil: null,
    ...over,
  };
}

// ── The amount ─────────────────────────────────────────────────────────────

test("the sweep moves the smaller of what is spare, what is needed and what is allowed", () => {
  // Spare 1,500,000 · needed 1,500,000 · allowed 1,000,000 → the cap wins.
  assert.equal(
    sweepAmount({
      depositBalance: 2_000_000,
      payoutBalance: 500_000,
      minKeep: 500_000,
      target: 2_000_000,
      maxDaily: 1_000_000,
      alreadySweptToday: 0,
    }),
    1_000_000,
  );

  // Spare 100,000 is now the smallest.
  assert.equal(
    sweepAmount({
      depositBalance: 600_000,
      payoutBalance: 500_000,
      minKeep: 500_000,
      target: 2_000_000,
      maxDaily: 1_000_000,
      alreadySweptToday: 0,
    }),
    100_000,
  );

  // Needed 50,000 is now the smallest.
  assert.equal(
    sweepAmount({
      depositBalance: 5_000_000,
      payoutBalance: 1_950_000,
      minKeep: 500_000,
      target: 2_000_000,
      maxDaily: 1_000_000,
      alreadySweptToday: 0,
    }),
    50_000,
  );
});

test("nothing moves when the deposit balance is at or below the minimum to keep", () => {
  assert.equal(
    sweepAmount({
      depositBalance: 400_000,
      payoutBalance: 0,
      minKeep: 500_000,
      target: 2_000_000,
      maxDaily: 1_000_000,
      alreadySweptToday: 0,
    }),
    0,
  );
});

test("nothing moves when the payout balance is already at its target", () => {
  assert.equal(
    sweepAmount({
      depositBalance: 9_000_000,
      payoutBalance: 2_500_000,
      minKeep: 500_000,
      target: 2_000_000,
      maxDaily: 1_000_000,
      alreadySweptToday: 0,
    }),
    0,
  );
});

test("the daily maximum counts what already moved today", () => {
  assert.equal(
    sweepAmount({
      depositBalance: 9_000_000,
      payoutBalance: 0,
      minKeep: 500_000,
      target: 2_000_000,
      maxDaily: 1_000_000,
      alreadySweptToday: 700_000,
    }),
    300_000,
  );

  // Exhausted for the day.
  assert.equal(
    sweepAmount({
      depositBalance: 9_000_000,
      payoutBalance: 0,
      minKeep: 500_000,
      target: 2_000_000,
      maxDaily: 1_000_000,
      alreadySweptToday: 1_000_000,
    }),
    0,
  );
});

test("the amount rounds down, never up", () => {
  assert.equal(
    sweepAmount({
      depositBalance: 500_123.459,
      payoutBalance: 0,
      minKeep: 500_000,
      target: 2_000_000,
      maxDaily: 1_000_000,
      alreadySweptToday: 0,
    }),
    123.45,
  );
});

// ── The pause ──────────────────────────────────────────────────────────────

test("a destination change pauses the sweep for a day", () => {
  const now = Date.parse("2026-03-01T10:00:00Z");
  assert.equal(sweepPaused("2026-03-02T09:59:00Z", now), true);
  assert.equal(sweepPaused("2026-03-01T09:59:00Z", now), false);
  assert.equal(sweepPaused(null, now), false);
});

test("a paused sweep does not run, however due it is", () => {
  const decision = shouldSweepNow({
    flagEnabled: true,
    settings: settings({ pausedUntil: "2030-01-01T00:00:00Z" }),
    now: new Date("2026-03-01T18:00:00Z"),
  });
  assert.deepEqual(decision, { run: false, reason: "paused" });
});

// ── When it is due ─────────────────────────────────────────────────────────

test("Lagos is an hour ahead, which is what decides the date as well as the time", () => {
  // 23:30 UTC is 00:30 the NEXT day in Lagos.
  const clock = lagosClock(new Date("2026-03-01T23:30:00Z"));
  assert.equal(clock.date, "2026-03-02");
  assert.equal(clock.minutes, 30);
});

test("a sweep time is read, and a typo falls back to the default rather than running early", () => {
  assert.equal(parseSweepTime("17:30"), 1050);
  assert.equal(parseSweepTime("09:05"), 545);
  assert.equal(parseSweepTime("nope"), null);
  assert.equal(parseSweepTime("25:00"), null);

  // 15:00 UTC is 16:00 Lagos — before the 17:30 default, so a broken setting
  // must not let it run.
  const decision = shouldSweepNow({
    flagEnabled: true,
    settings: settings({ timeLagos: "nope" }),
    now: new Date("2026-03-01T15:00:00Z"),
  });
  assert.deepEqual(decision, { run: false, reason: "not_yet_today" });
});

test("before the sweep time nothing runs; after it, the day is named", () => {
  assert.deepEqual(
    shouldSweepNow({
      flagEnabled: true,
      settings: settings(),
      now: new Date("2026-03-01T10:00:00Z"),
    }),
    { run: false, reason: "not_yet_today" },
  );

  assert.deepEqual(
    shouldSweepNow({
      flagEnabled: true,
      settings: settings(),
      now: new Date("2026-03-01T17:00:00Z"),
    }),
    { run: true, lagosDate: "2026-03-01" },
  );
});

test("the flag off and a missing destination both stop it", () => {
  assert.deepEqual(
    shouldSweepNow({ flagEnabled: false, settings: settings(), now: new Date("2026-03-01T18:00:00Z") }),
    { run: false, reason: "flag_off" },
  );
  assert.deepEqual(
    shouldSweepNow({
      flagEnabled: true,
      settings: settings({ accountNumber: "" }),
      now: new Date("2026-03-01T18:00:00Z"),
    }),
    { run: false, reason: "no_destination" },
  );
});

// ── Running it ─────────────────────────────────────────────────────────────

function harness(
  options: {
    depositBalance?: number | null;
    payoutBalance?: number | null;
    sweptToday?: { total: number; count: number };
    sendThrows?: boolean;
  } = {},
) {
  const recorded = new Set<string>();
  const calls = {
    sends: [] as { reference: string; amount: number }[],
    settles: [] as string[],
    emails: 0,
  };

  const deps: SweepDeps = {
    async depositBalance() {
      return options.depositBalance === undefined ? 3_000_000 : options.depositBalance;
    },
    async payoutBalance() {
      return options.payoutBalance === undefined ? 0 : options.payoutBalance;
    },
    async sweptToday() {
      return options.sweptToday ?? { total: 0, count: 0 };
    },
    async record(input) {
      // The database's rule, reproduced: the unique index means the second
      // insert writes nothing.
      if (recorded.has(input.reference)) return null;
      recorded.add(input.reference);
      return { id: `mv_${recorded.size}` };
    },
    async send(input) {
      calls.sends.push(input);
      if (options.sendThrows) throw new Error("refused");
      return { status: "processing" };
    },
    async settle(reference, status) {
      calls.settles.push(`${reference}:${status}`);
    },
    async emailAdmins() {
      calls.emails += 1;
    },
    log: () => {},
  };

  return { deps, calls, recorded };
}

const DUE = { now: new Date("2026-03-01T17:00:00Z"), flagEnabled: true };

test("a due sweep records first, then sends, then tells admins", async () => {
  const { deps, calls } = harness();
  const result = await runSweep(deps, { settings: settings(), ...DUE });

  assert.deepEqual(result, {
    swept: true,
    amount: 1_000_000,
    reference: sweepReference("NGN", "2026-03-01"),
  });
  assert.equal(calls.sends.length, 1);
  assert.deepEqual(calls.settles, [`${sweepReference("NGN", "2026-03-01")}:sent`]);
  assert.equal(calls.emails, 1);
});

test("two runs on the same day send exactly one transfer", async () => {
  // THE behaviour this module exists for. Two cron runs a second apart must
  // not move the money twice.
  const { deps, calls } = harness();
  await runSweep(deps, { settings: settings(), ...DUE });
  const second = await runSweep(deps, { settings: settings(), ...DUE });

  assert.deepEqual(second, { swept: false, reason: "already_swept" });
  assert.equal(calls.sends.length, 1);
});

test("a refused transfer is recorded as failed and not retried the same day", async () => {
  const { deps, calls } = harness({ sendThrows: true });
  const first = await runSweep(deps, { settings: settings(), ...DUE });
  assert.deepEqual(first, { swept: false, reason: "send_failed" });
  assert.deepEqual(calls.settles, [`${sweepReference("NGN", "2026-03-01")}:failed`]);

  // The reference is taken, so nothing sends again today.
  const second = await runSweep(deps, { settings: settings(), ...DUE });
  assert.deepEqual(second, { swept: false, reason: "already_swept" });
  assert.equal(calls.sends.length, 1);
});

test("a balance that could not be read sweeps nothing", async () => {
  const { deps, calls } = harness({ payoutBalance: null });
  const result = await runSweep(deps, { settings: settings(), ...DUE });

  assert.deepEqual(result, { swept: false, reason: "nothing_to_move" });
  assert.equal(calls.sends.length, 0);
});

test("Sweep now skips the clock and nothing else", async () => {
  const early = new Date("2026-03-01T06:00:00Z");

  const { deps, calls } = harness();
  const manual = await runSweep(deps, {
    settings: settings(),
    flagEnabled: true,
    manual: true,
    adminId: "admin_1",
    now: early,
  });
  assert.equal(manual.swept, true);
  assert.equal(calls.sends.length, 1);

  // Still refuses while paused.
  const paused = harness();
  assert.deepEqual(
    await runSweep(paused.deps, {
      settings: settings({ pausedUntil: "2030-01-01T00:00:00Z" }),
      flagEnabled: true,
      manual: true,
      now: early,
    }),
    { swept: false, reason: "paused" },
  );
  assert.equal(paused.calls.sends.length, 0);

  // And still obeys the daily maximum.
  const capped = harness({ sweptToday: { total: 1_000_000, count: 1 } });
  assert.deepEqual(
    await runSweep(capped.deps, {
      settings: settings(),
      flagEnabled: true,
      manual: true,
      now: early,
    }),
    { swept: false, reason: "nothing_to_move" },
  );
  assert.equal(capped.calls.sends.length, 0);
});

test("a manual sweep after an automatic one gets its own reference", async () => {
  const { deps, calls } = harness();
  await runSweep(deps, { settings: settings(), ...DUE });

  const second = harness({
    sweptToday: { total: 400_000, count: 1 },
    depositBalance: 3_000_000,
  });
  const manual = await runSweep(second.deps, {
    settings: settings(),
    flagEnabled: true,
    manual: true,
    now: DUE.now,
  });

  assert.equal(manual.swept, true);
  assert.equal(manual.swept && manual.reference, "sweep_NGN_2026-03-01_m2");
  // The daily cap still applies across both.
  assert.equal(manual.swept && manual.amount, 600_000);
  assert.equal(calls.sends.length, 1);
});

// ── The page's own arithmetic ──────────────────────────────────────────────

test("the position adds both providers and subtracts what customers are owed", () => {
  const rows = treasuryRows(
    { korapay: { NGN: 1_000_000 }, busha: { NGN: 500_000, KES: 2_000 } },
    { NGN: 1_200_000, KES: 5_000 },
  );

  assert.deepEqual(rows, [
    { currency: "KES", korapay: null, busha: 2_000, liabilities: 5_000, difference: -3_000 },
    { currency: "NGN", korapay: 1_000_000, busha: 500_000, liabilities: 1_200_000, difference: 300_000 },
  ]);
});

test("a balance nobody could read is a dash, not a zero", () => {
  const rows = treasuryRows({ korapay: {}, busha: {} }, { NGN: 100 });
  assert.equal(rows[0]!.korapay, null);
  assert.equal(rows[0]!.difference, null);
});

test("the two warnings fire on the numbers that matter, and only then", () => {
  const warnings = treasuryWarnings({
    bushaNgn: 100_000,
    pendingNgnConversions: 250_000,
    pendingWithdrawals: [{ provider: "korapay", currency: "NGN", total: 900_000 }],
    balances: { korapay: { NGN: 400_000 }, busha: { NGN: 100_000 } },
  });

  assert.equal(warnings.length, 2);
  assert.ok(warnings.every((w) => w.currency === "NGN"));
});

test("a balance that could not be read raises no warning at all", () => {
  const warnings = treasuryWarnings({
    bushaNgn: null,
    pendingNgnConversions: 250_000,
    pendingWithdrawals: [{ provider: "busha", currency: "KES", total: 900_000 }],
    balances: { korapay: {}, busha: {} },
  });

  assert.deepEqual(warnings, []);
});

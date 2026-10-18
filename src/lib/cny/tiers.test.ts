import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveForwardTier,
  resolveReverseTier,
  lowestTier,
  computeCnyAmounts,
  solveCnySpend,
  type CnyTier,
} from "./tiers.ts";

/**
 * The ladder's two directions, and the one that is easy to get wrong.
 *
 * Reverse is trivial — the CNY figure is the input, so the band is a lookup.
 * Forward is not: the CNY figure is the OUTPUT of the rate being chosen, so
 * the band has to be found by walking up until the result stops overshooting.
 * Everything below exists to pin that walk down, including the property that
 * makes it terminate.
 */

const TIERS: CnyTier[] = [
  { tierMinCny: 0, tierMaxCny: 999, usdtToCnyRate: 6.5 },
  { tierMinCny: 1000, tierMaxCny: 9999, usdtToCnyRate: 6.6 },
  { tierMinCny: 10000, tierMaxCny: 100000, usdtToCnyRate: 6.7 },
];

describe("resolveReverseTier", () => {
  test("picks the band the CNY amount falls in", () => {
    assert.equal(resolveReverseTier(500, TIERS)!.usdtToCnyRate, 6.5);
    assert.equal(resolveReverseTier(5000, TIERS)!.usdtToCnyRate, 6.6);
    assert.equal(resolveReverseTier(50000, TIERS)!.usdtToCnyRate, 6.7);
  });

  test("band boundaries are inclusive on both sides", () => {
    assert.equal(resolveReverseTier(999, TIERS)!.usdtToCnyRate, 6.5);
    assert.equal(resolveReverseTier(1000, TIERS)!.usdtToCnyRate, 6.6);
  });

  test("an amount above every ceiling takes the top band, it does not fail", () => {
    // The top row is a floor on how good the rate gets, not a cap on order
    // size. Returning null here would refuse the largest and most valuable
    // orders the business can take.
    assert.equal(resolveReverseTier(5_000_000, TIERS)!.usdtToCnyRate, 6.7);
  });

  test("no bands configured is null, not a crash", () => {
    assert.equal(resolveReverseTier(500, []), null);
  });

  test("the ladder does not have to be given in order", () => {
    const shuffled = [TIERS[2], TIERS[0], TIERS[1]];
    assert.equal(resolveReverseTier(500, shuffled)!.usdtToCnyRate, 6.5);
  });
});

describe("resolveForwardTier", () => {
  test("a small order stays in the first band", () => {
    // 100 USDT * 6.5 = 650 CNY, inside 0-999.
    assert.equal(resolveForwardTier(100, TIERS)!.usdtToCnyRate, 6.5);
  });

  test("an order that overshoots its band escalates", () => {
    // 200 USDT * 6.5 = 1,300 — past the first band's 999 ceiling, so the
    // order is really a second-band one and is priced at 6.6.
    assert.equal(resolveForwardTier(200, TIERS)!.usdtToCnyRate, 6.6);
  });

  test("it escalates more than one band when it has to", () => {
    // 2,000 USDT * 6.5 = 13,000 — past band 1 AND band 2.
    assert.equal(resolveForwardTier(2000, TIERS)!.usdtToCnyRate, 6.7);
  });

  test("the top band absorbs anything larger", () => {
    assert.equal(resolveForwardTier(1_000_000, TIERS)!.usdtToCnyRate, 6.7);
  });

  test("ESCALATION TERMINATES: every band's result lands at or above its floor", () => {
    // The property the walk depends on — a higher band's rate is never worse,
    // so escalating only ever produces a LARGER CNY figure and a threshold
    // crossed on the way up is never un-crossed. Checked across the range
    // rather than asserted in prose.
    for (let usdt = 1; usdt <= 20000; usdt *= 1.37) {
      const tier = resolveForwardTier(usdt, TIERS)!;
      const cny = usdt * tier.usdtToCnyRate;
      const isTop = tier.usdtToCnyRate === 6.7;
      assert.ok(
        cny <= tier.tierMaxCny || isTop,
        `${usdt} USDT priced at ${tier.usdtToCnyRate} gives ${cny} CNY, outside its own band`,
      );
    }
  });

  test("no bands configured is null", () => {
    assert.equal(resolveForwardTier(100, []), null);
  });
});

describe("lowestTier", () => {
  test("is the cheapest band regardless of input order", () => {
    assert.equal(lowestTier([TIERS[2], TIERS[1], TIERS[0]])!.usdtToCnyRate, 6.5);
  });
  test("is null with no ladder", () => {
    assert.equal(lowestTier([]), null);
  });
});

describe("computeCnyAmounts — to_cny", () => {
  test("a fiat payer goes through the USDT leg first", () => {
    // 1,000,000 NGN at 0.000676 USDT/NGN = 676 USDT; 676 * 6.6 = 4,461.60.
    const result = computeCnyAmounts("to_cny", 1_000_000, 0.000676, TIERS)!;
    assert.equal(result.tierRate, 6.6);
    assert.equal(result.cnyAmount, 4461.6);
    assert.equal(result.nonCnyAmount, 1_000_000);
  });

  test("a USDT payer has no fiat leg at all", () => {
    // null rate means the amount IS already USDT. Multiplying by a rate of 1
    // would be the same number, but the distinction matters: there is no
    // provider lookup to fail.
    const result = computeCnyAmounts("to_cny", 100, null, TIERS)!;
    assert.equal(result.cnyAmount, 650);
    assert.equal(result.tierRate, 6.5);
  });

  test("the band is chosen on the USDT equivalent, not the fiat figure", () => {
    // 1,000,000 naira is a big NUMBER and a small order. Resolving the band
    // on the raw fiat amount would hand it the top rate.
    const result = computeCnyAmounts("to_cny", 1_000_000, 0.0000676, TIERS)!;
    assert.equal(result.tierRate, 6.5, "67.6 USDT is a first-band order");
  });

  test("a zero or negative amount prices nothing", () => {
    assert.equal(computeCnyAmounts("to_cny", 0, 0.000676, TIERS), null);
    assert.equal(computeCnyAmounts("to_cny", -5, 0.000676, TIERS), null);
    assert.equal(computeCnyAmounts("to_cny", Number.NaN, 0.000676, TIERS), null);
  });
});

describe("computeCnyAmounts — from_cny", () => {
  test("spending CNY resolves the band directly off the CNY figure", () => {
    const result = computeCnyAmounts("from_cny", 5000, 0.000676, TIERS)!;
    assert.equal(result.tierRate, 6.6);
    assert.equal(result.cnyAmount, 5000);
    // 5000 / 6.6 = 757.5757… USDT; / 0.000676 = 1,120,674.46 NGN.
    assert.ok(Math.abs(result.nonCnyAmount - 1_120_674.46) < 0.5);
  });

  test("spending CNY for USDT skips the fiat leg", () => {
    const result = computeCnyAmounts("from_cny", 650, null, TIERS)!;
    assert.equal(result.nonCnyAmount, 100);
  });
});

describe("solveCnySpend", () => {
  test("solves the spend from a wanted CNY delivery", () => {
    // Wanting 650 CNY: band 1, 650/6.5 = 100 USDT, /0.000676 = 147,928.99 NGN.
    const result = solveCnySpend(650, 0.000676, TIERS)!;
    assert.equal(result.cnyAmount, 650);
    assert.ok(Math.abs(result.nonCnyAmount - 147_928.99) < 0.5);
    assert.equal(result.tierRate, 6.5);
  });

  test("THE BAND COMES FROM THE CNY FIGURE, not from a USDT equivalent", () => {
    // The trap: the conversion runs forward (fiat -> CNY) so the forward
    // resolver looks like the right one — but the number in hand here is
    // already CNY, and feeding a CNY amount to a resolver expecting USDT
    // picks the band by a figure roughly 6.5x too large.
    //
    // 900 CNY is a first-band order. Run through resolveForwardTier it would
    // read as 900 "USDT" = 5,850 CNY and land in band 2.
    assert.equal(solveCnySpend(900, 0.000676, TIERS)!.tierRate, 6.5);
    assert.equal(resolveForwardTier(900, TIERS)!.usdtToCnyRate, 6.6, "the wrong answer, for contrast");
  });

  test("solving and computing agree with each other", () => {
    // Round-trip: solve for the spend that buys 4,000 CNY, then price that
    // spend forward and expect 4,000 back.
    const solved = solveCnySpend(4000, 0.000676, TIERS)!;
    const forward = computeCnyAmounts("to_cny", solved.nonCnyAmount, 0.000676, TIERS)!;
    assert.ok(
      Math.abs(forward.cnyAmount - 4000) < 0.05,
      `round trip drifted: ${forward.cnyAmount}`,
    );
  });

  test("refuses a nonsense target", () => {
    assert.equal(solveCnySpend(0, 0.000676, TIERS), null);
    assert.equal(solveCnySpend(-1, 0.000676, TIERS), null);
  });
});

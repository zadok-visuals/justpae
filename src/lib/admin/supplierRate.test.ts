import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { usdtRateAt, toUsdt, type SupplierRateRow } from "./supplierRate.ts";

/**
 * The rate lookup the whole margin report rests on.
 *
 * The case worth testing hardest is the one that used to be a silent bug:
 * an order placed BEFORE anybody entered a supplier rate for its pair. The
 * obvious implementation returns null there, the caller counts the order as
 * skipped, and the operator is shown a total that quietly omits their first
 * months of trading with only a skip count to hint at it.
 *
 * Falling back to the earliest rate on file is an estimate. The `estimated`
 * flag is the entire reason that is acceptable: the figure still gets
 * counted, and it is never presented as the real historical rate.
 */

function rate(
  quote: string,
  buy_rate: number,
  effective_from: string,
  base_currency = "USDT",
): SupplierRateRow {
  return { base_currency, quote_currency: quote, buy_rate, effective_from };
}

const CNY_RATES: SupplierRateRow[] = [
  rate("CNY", 6.4, "2026-01-01T00:00:00Z"),
  rate("CNY", 6.6, "2026-03-01T00:00:00Z"),
  rate("CNY", 6.9, "2026-06-01T00:00:00Z"),
];

describe("usdtRateAt — the rate actually in force", () => {
  test("uses the latest rate whose effective_from has already passed", () => {
    assert.deepEqual(usdtRateAt(CNY_RATES, "CNY", "2026-06-02T00:00:00Z"), {
      rate: 6.9,
      estimated: false,
    });
  });

  test("picks the rate in force at the order's time, not the newest on file", () => {
    assert.deepEqual(usdtRateAt(CNY_RATES, "CNY", "2026-04-15T00:00:00Z"), {
      rate: 6.6,
      estimated: false,
    });
  });

  test("a rate effective at exactly the order's timestamp counts as in force", () => {
    assert.deepEqual(usdtRateAt(CNY_RATES, "CNY", "2026-03-01T00:00:00Z"), {
      rate: 6.6,
      estimated: false,
    });
  });

  test("rows arriving in any order give the same answer", () => {
    const shuffled = [CNY_RATES[2], CNY_RATES[0], CNY_RATES[1]];
    assert.deepEqual(usdtRateAt(shuffled, "CNY", "2026-04-15T00:00:00Z"), {
      rate: 6.6,
      estimated: false,
    });
  });
});

describe("usdtRateAt — the estimated fallback", () => {
  test("an order predating every rate on file uses the EARLIEST one, flagged estimated", () => {
    assert.deepEqual(usdtRateAt(CNY_RATES, "CNY", "2025-11-01T00:00:00Z"), {
      rate: 6.4,
      estimated: true,
    });
  });

  test("the fallback is the earliest, not the latest — it must not use today's rate for last year's order", () => {
    const lookup = usdtRateAt(CNY_RATES, "CNY", "2025-01-01T00:00:00Z");
    assert.equal(lookup?.rate, 6.4);
    assert.notEqual(lookup?.rate, 6.9);
  });

  test("null only when the pair has no rate at all — the one case with nothing to estimate from", () => {
    assert.equal(usdtRateAt(CNY_RATES, "NGN", "2026-04-15T00:00:00Z"), null);
    assert.equal(usdtRateAt([], "CNY", "2026-04-15T00:00:00Z"), null);
  });

  test("a rate for a different quote currency is not a rate for this pair", () => {
    const rates = [rate("KES", 130, "2026-01-01T00:00:00Z")];
    assert.equal(usdtRateAt(rates, "CNY", "2026-04-15T00:00:00Z"), null);
  });

  test("a rate for a different BASE currency is not a USDT rate", () => {
    // NGN/CNY is a real pair somebody might record, and reading it as if it
    // were USDT/CNY would be off by three orders of magnitude.
    const rates = [rate("CNY", 206, "2026-01-01T00:00:00Z", "NGN")];
    assert.equal(usdtRateAt(rates, "CNY", "2026-04-15T00:00:00Z"), null);
  });

  test("numeric strings from the driver are coerced, not concatenated", () => {
    // numeric(24,10) arrives as a string over the wire often enough that a
    // missing Number() shows up as "6.4" / division NaN rather than an error.
    const rates = [
      { base_currency: "USDT", quote_currency: "CNY", buy_rate: "6.4" as unknown as number, effective_from: "2026-01-01T00:00:00Z" },
    ];
    const lookup = usdtRateAt(rates, "CNY", "2026-04-15T00:00:00Z");
    assert.equal(typeof lookup?.rate, "number");
    assert.equal(lookup?.rate, 6.4);
  });
});

describe("toUsdt", () => {
  test("USDT needs no rate and is never an estimate", () => {
    assert.deepEqual(toUsdt(100, "USDT", [], "2026-04-15T00:00:00Z"), {
      usdt: 100,
      rate: 1,
      estimated: false,
    });
  });

  test("divides by the rate in force — quote per 1 base", () => {
    const result = toUsdt(660, "CNY", CNY_RATES, "2026-04-15T00:00:00Z");
    assert.equal(result?.usdt, 100);
    assert.equal(result?.estimated, false);
  });

  test("carries the estimated flag through from the fallback", () => {
    const result = toUsdt(640, "CNY", CNY_RATES, "2025-11-01T00:00:00Z");
    assert.equal(result?.usdt, 100);
    assert.equal(result?.estimated, true);
  });

  test("null when the pair has no rate, so the caller skips rather than counting zero", () => {
    assert.equal(toUsdt(1000, "NGN", CNY_RATES, "2026-04-15T00:00:00Z"), null);
  });

  test("a non-positive rate is refused rather than dividing by zero", () => {
    const rates = [rate("NGN", 0, "2026-01-01T00:00:00Z")];
    assert.equal(toUsdt(1000, "NGN", rates, "2026-04-15T00:00:00Z"), null);
  });
});

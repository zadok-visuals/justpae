import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computePnl, type PnlInputRow } from "./pnlMath.ts";
import type { SupplierRateRow } from "./supplierRate.ts";

/**
 * The margin arithmetic.
 *
 * Worth testing because none of it is visible by reading the page that
 * renders it: a sign error shows up as a plausible-looking negative, and a
 * double count shows up as a plausible-looking total that is simply too big.
 * Both survive a careful read of the UI indefinitely.
 *
 * Every expectation below is in USDT, because that is the only unit the four
 * routes can be added in — see pnlMath.ts's header.
 */

const RATES: SupplierRateRow[] = [
  // One USDT costs us 6.4 yuan, 1,500 naira, 130 shillings.
  { base_currency: "USDT", quote_currency: "CNY", buy_rate: 6.4, effective_from: "2026-01-01T00:00:00Z" },
  { base_currency: "USDT", quote_currency: "NGN", buy_rate: 1500, effective_from: "2026-01-01T00:00:00Z" },
  { base_currency: "USDT", quote_currency: "KES", buy_rate: 130, effective_from: "2026-01-01T00:00:00Z" },
];

const AT = "2026-04-01T00:00:00Z";
/** Before every rate above — forces the earliest-on-file fallback. */
const BEFORE_ANY_RATE = "2025-06-01T00:00:00Z";

function row(partial: Partial<PnlInputRow> & Pick<PnlInputRow, "id" | "type">): PnlInputRow {
  return {
    createdAt: AT,
    provider: "manual",
    currency: "NGN",
    amount: 0,
    targetCurrency: null,
    targetAmount: null,
    actualTargetAmount: null,
    rawTargetAmount: null,
    ...partial,
  };
}

function near(actual: number | null, expected: number, label = "") {
  assert.ok(actual != null, `${label}: expected a figure, got null`);
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${label}: expected ~${expected}, got ${actual}`,
  );
}

describe("provider conversions — the margin is already on the row", () => {
  test("the gap between delivered and credited, converted to USDT", () => {
    // Provider delivered 1,500,000 NGN; customer credited 1,470,000. The
    // 30,000 NGN kept is 20 USDT at 1,500 NGN/USDT.
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          currency: "USDT",
          amount: 1000,
          targetCurrency: "NGN",
          targetAmount: 1_470_000,
          rawTargetAmount: 1_500_000,
        }),
      ],
      RATES,
    );
    near(totals.conversionUsdt, 20, "conversion");
    near(totals.totalUsdt, 20, "total");
    assert.equal(orders[0].route, "conversion");
    assert.equal(orders[0].estimated, false);
    assert.equal(totals.skipped, 0);
  });

  test("the margin is NOT reconstructed from a rate — only the recorded gap counts", () => {
    // Same order, but the provider delivered exactly what the customer got.
    // Zero margin, not whatever a rate reconstruction would have implied.
    const { totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          currency: "USDT",
          amount: 1000,
          targetCurrency: "NGN",
          targetAmount: 1_500_000,
          rawTargetAmount: 1_500_000,
        }),
      ],
      RATES,
    );
    near(totals.conversionUsdt, 0, "conversion");
  });

  test("no rate trail recorded is skipped, never counted as zero", () => {
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          currency: "USDT",
          amount: 1000,
          targetCurrency: "NGN",
          targetAmount: 1_470_000,
          rawTargetAmount: null,
        }),
      ],
      RATES,
    );
    assert.equal(orders[0].pnlUsdt, null);
    assert.equal(totals.skipped, 1);
    assert.equal(totals.totalUsdt, 0);
    assert.match(orders[0].skippedReason ?? "", /rate trail/i);
  });

  test("a target currency with no supplier rate on file is skipped with the pair named", () => {
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          currency: "USDT",
          amount: 1000,
          targetCurrency: "GHS",
          targetAmount: 14_700,
          rawTargetAmount: 15_000,
        }),
      ],
      RATES,
    );
    assert.equal(orders[0].pnlUsdt, null);
    assert.equal(totals.skipped, 1);
    assert.match(orders[0].skippedReason ?? "", /USDT\/GHS/);
  });
});

describe("yuan conversions — revenue minus what the yuan cost us", () => {
  test("buying yuan: the gap between what came in and what the yuan cost", () => {
    // Customer paid 1,500,000 NGN (= 1,000 USDT at 1,500) and received
    // 6,000 CNY (= 937.5 USDT at 6.4). Margin 62.5 USDT.
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          currency: "NGN",
          amount: 1_500_000,
          targetCurrency: "CNY",
          targetAmount: 6000,
          rawTargetAmount: 6120,
        }),
      ],
      RATES,
    );
    assert.equal(orders[0].route, "cny_conversion");
    near(totals.cnyConversionUsdt, 62.5, "cny");
    // Deliberately NOT the markup gap (120 CNY = 18.75 USDT): on this route
    // the business is the counterparty, so the two genuinely differ.
    assert.notEqual(Math.round(totals.cnyConversionUsdt * 100) / 100, 18.75);
  });

  test("selling yuan back: the subtraction flips, and the margin stays positive", () => {
    // Customer paid 6,400 CNY (= 1,000 USDT at 6.4) and received 1,425,000
    // NGN (= 950 USDT at 1,500). Margin 50 USDT.
    const { totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          currency: "CNY",
          amount: 6400,
          targetCurrency: "NGN",
          targetAmount: 1_425_000,
          rawTargetAmount: 1_450_000,
        }),
      ],
      RATES,
    );
    near(totals.cnyConversionUsdt, 50, "cny sell");
  });

  test("a yuan conversion priced against us reports a LOSS, not an absolute value", () => {
    // Customer paid 1,500,000 NGN (1,000 USDT) for 7,000 CNY (1,093.75 USDT).
    const { totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          currency: "NGN",
          amount: 1_500_000,
          targetCurrency: "CNY",
          targetAmount: 7000,
          rawTargetAmount: 7000,
        }),
      ],
      RATES,
    );
    near(totals.cnyConversionUsdt, -93.75, "cny loss");
    assert.ok(totals.totalUsdt < 0);
  });

  test("USDT to yuan needs no fiat rate at all", () => {
    // 1,000 USDT in, 6,000 CNY out (937.5 USDT). Margin 62.5 USDT, computed
    // with only the CNY rate on file.
    const onlyCny = [RATES[0]];
    const { totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          currency: "USDT",
          amount: 1000,
          targetCurrency: "CNY",
          targetAmount: 6000,
          rawTargetAmount: 6060,
        }),
      ],
      onlyCny,
    );
    near(totals.cnyConversionUsdt, 62.5, "usdt to cny");
    assert.equal(totals.skipped, 0);
  });

  test("missing USDT/CNY is skipped with CNY named, even when the other leg is on file", () => {
    const noCny = [RATES[1]];
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          currency: "NGN",
          amount: 1_500_000,
          targetCurrency: "CNY",
          targetAmount: 6000,
          rawTargetAmount: 6000,
        }),
      ],
      noCny,
    );
    assert.equal(totals.skipped, 1);
    assert.match(orders[0].skippedReason ?? "", /USDT\/CNY/);
  });
});

describe("pay to China", () => {
  test("revenue minus the yuan actually delivered", () => {
    // Debited 1,500,000 NGN (1,000 USDT); delivered 6,000 CNY (937.5 USDT).
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "pay_to_china",
          currency: "NGN",
          amount: 1_500_000,
          targetCurrency: "CNY",
          targetAmount: 6000,
          actualTargetAmount: 6000,
        }),
      ],
      RATES,
    );
    assert.equal(orders[0].route, "pay_to_china");
    near(totals.payToChinaUsdt, 62.5, "p2c");
  });

  test("what the admin actually sent wins over what was quoted", () => {
    // Quoted 6,000 CNY but 6,200 were actually delivered: the margin is the
    // real one (1000 - 968.75), not the quoted one.
    const { totals } = computePnl(
      [
        row({
          id: "a",
          type: "pay_to_china",
          currency: "NGN",
          amount: 1_500_000,
          targetCurrency: "CNY",
          targetAmount: 6000,
          actualTargetAmount: 6200,
        }),
      ],
      RATES,
    );
    near(totals.payToChinaUsdt, 31.25, "p2c actual");
  });

  test("funded from a CNY balance: counted nowhere, and surfaced as deliberate", () => {
    // The margin on this yuan was realised when it was bought. Counting the
    // spend too would report the same trade twice.
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "pay_to_china",
          currency: "CNY",
          amount: 6000,
          targetCurrency: "CNY",
          targetAmount: 6000,
          actualTargetAmount: 6000,
        }),
      ],
      RATES,
    );
    assert.equal(orders.length, 0, "no order row — it is not an omission to explain");
    assert.equal(totals.payToChinaUsdt, 0);
    assert.equal(totals.skipped, 0, "not a skip: nothing is missing");
    assert.equal(totals.cnyFundedPayments, 1, "but the operator is told it happened");
  });

  test("a request with no CNY amount yet is skipped, not valued at zero", () => {
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "pay_to_china",
          currency: "NGN",
          amount: 1_500_000,
          targetCurrency: "CNY",
          targetAmount: null,
          actualTargetAmount: null,
        }),
      ],
      RATES,
    );
    assert.equal(orders[0].pnlUsdt, null);
    assert.equal(totals.skipped, 1);
  });
});

describe("withdrawal fees", () => {
  test("the fee is what was debited minus what was paid out, converted", () => {
    // 1% of 1,000,000 NGN is 10,000 NGN, which is 6.666… USDT at 1,500.
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "withdrawal",
          currency: "NGN",
          amount: 1_000_000,
          targetAmount: 990_000,
        }),
      ],
      RATES,
    );
    assert.equal(orders[0].route, "withdrawal_fee");
    near(totals.withdrawalFeesUsdt, 10_000 / 1500, "withdrawal fee");
  });

  test("a USDT withdrawal fee needs no conversion", () => {
    const { totals } = computePnl(
      [row({ id: "a", type: "withdrawal", currency: "USDT", amount: 1000, targetAmount: 990 })],
      RATES,
    );
    near(totals.withdrawalFeesUsdt, 10, "usdt fee");
  });

  test("a withdrawal with no payout figure contributes nothing and is not an omission", () => {
    const { orders, totals } = computePnl(
      [row({ id: "a", type: "withdrawal", currency: "NGN", amount: 1_000_000, targetAmount: null })],
      RATES,
    );
    assert.equal(orders.length, 0);
    assert.equal(totals.skipped, 0);
  });
});

describe("the estimated fallback, through the whole calculation", () => {
  test("an order predating every rate is COUNTED, flagged, and tallied", () => {
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          createdAt: BEFORE_ANY_RATE,
          currency: "USDT",
          amount: 1000,
          targetCurrency: "NGN",
          targetAmount: 1_470_000,
          rawTargetAmount: 1_500_000,
        }),
      ],
      RATES,
    );
    assert.equal(orders[0].estimated, true);
    assert.equal(totals.estimated, 1);
    assert.equal(totals.skipped, 0, "estimated is the opposite of skipped");
    near(totals.conversionUsdt, 20, "estimated conversion still counts");
  });

  test("either leg being an estimate taints the yuan order", () => {
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          createdAt: BEFORE_ANY_RATE,
          currency: "NGN",
          amount: 1_500_000,
          targetCurrency: "CNY",
          targetAmount: 6000,
          rawTargetAmount: 6000,
        }),
      ],
      RATES,
    );
    assert.equal(orders[0].estimated, true);
    assert.equal(totals.estimated, 1);
  });

  test("an estimate is never silently preferred to a real rate", () => {
    const { orders, totals } = computePnl(
      [
        row({
          id: "a",
          type: "withdrawal",
          createdAt: AT,
          currency: "NGN",
          amount: 1_000_000,
          targetAmount: 990_000,
        }),
      ],
      RATES,
    );
    assert.equal(orders[0].estimated, false);
    assert.equal(totals.estimated, 0);
  });
});

describe("totals across every route", () => {
  test("the grand total is the four routes added, and nothing is counted twice", () => {
    const rows: PnlInputRow[] = [
      row({
        id: "conv",
        type: "convert",
        currency: "USDT",
        amount: 1000,
        targetCurrency: "NGN",
        targetAmount: 1_470_000,
        rawTargetAmount: 1_500_000,
      }), // +20
      row({
        id: "cny",
        type: "convert",
        currency: "NGN",
        amount: 1_500_000,
        targetCurrency: "CNY",
        targetAmount: 6000,
        rawTargetAmount: 6000,
      }), // +62.5
      row({
        id: "p2c",
        type: "pay_to_china",
        currency: "NGN",
        amount: 1_500_000,
        targetCurrency: "CNY",
        targetAmount: 6000,
        actualTargetAmount: 6000,
      }), // +62.5
      row({ id: "wd", type: "withdrawal", currency: "USDT", amount: 1000, targetAmount: 990 }), // +10
      row({
        id: "p2c-cny",
        type: "pay_to_china",
        currency: "CNY",
        amount: 6000,
        targetCurrency: "CNY",
        targetAmount: 6000,
        actualTargetAmount: 6000,
      }), // counted nowhere
    ];

    const { orders, totals } = computePnl(rows, RATES);

    near(totals.conversionUsdt, 20, "conversions");
    near(totals.cnyConversionUsdt, 62.5, "yuan");
    near(totals.payToChinaUsdt, 62.5, "pay to china");
    near(totals.withdrawalFeesUsdt, 10, "fees");
    near(totals.totalUsdt, 155, "grand total");
    assert.equal(totals.cnyFundedPayments, 1);
    assert.equal(orders.length, 4, "the CNY-funded payment produces no row");
  });

  test("an empty report is zero everywhere rather than NaN", () => {
    const { orders, totals } = computePnl([], RATES);
    assert.equal(orders.length, 0);
    assert.equal(totals.totalUsdt, 0);
    assert.equal(totals.skipped, 0);
    assert.equal(totals.estimated, 0);
  });

  test("orders come back newest first", () => {
    const { orders } = computePnl(
      [
        row({
          id: "old",
          type: "withdrawal",
          createdAt: "2026-02-01T00:00:00Z",
          currency: "USDT",
          amount: 100,
          targetAmount: 99,
        }),
        row({
          id: "new",
          type: "withdrawal",
          createdAt: "2026-05-01T00:00:00Z",
          currency: "USDT",
          amount: 100,
          targetAmount: 99,
        }),
      ],
      RATES,
    );
    assert.deepEqual(
      orders.map((o) => o.id),
      ["new", "old"],
    );
  });

  test("with no supplier rates at all, everything is skipped and nothing is invented", () => {
    const { totals } = computePnl(
      [
        row({
          id: "a",
          type: "convert",
          currency: "USDT",
          amount: 1000,
          targetCurrency: "NGN",
          targetAmount: 1_470_000,
          rawTargetAmount: 1_500_000,
        }),
        row({ id: "b", type: "withdrawal", currency: "NGN", amount: 1_000_000, targetAmount: 990_000 }),
      ],
      [],
    );
    assert.equal(totals.skipped, 2);
    assert.equal(totals.totalUsdt, 0);
  });
});

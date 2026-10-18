import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { priceCnyConversion, cnyRouteBlocker, indicativeCnyRate } from "./priceCore.ts";
import type { CnyTier } from "./tiers.ts";

/**
 * CNY pricing: the ladder and the markup, blended.
 *
 * tiers.test.ts already proves the ladder resolves the right band. What this
 * file is for is the step after: the markup, and specifically its DIRECTION.
 *
 * A markup applied to the wrong side of the trade is the quietest possible
 * bug. The quote still looks like a quote, the arithmetic still balances, and
 * the business simply gives away its margin on every order in one direction
 * while double-charging in the other. Nothing on screen says so.
 */

// One USDT buys 6.0 yuan in the smallest band, 6.3 in the largest — the
// ladder rewards size, which is the whole reason it is a ladder.
const TIERS: CnyTier[] = [
  { tierMinCny: 0, tierMaxCny: 10_000, usdtToCnyRate: 6.0 },
  { tierMinCny: 10_000, tierMaxCny: 100_000, usdtToCnyRate: 6.3 },
];

const NO_MARKUP = 0;
const TWO_PERCENT = 0.02;

describe("markup direction — the customer always gets the worse side", () => {
  test("buying yuan: the markup reduces the yuan DELIVERED, never the amount paid", () => {
    const raw = priceCnyConversion({
      direction: "to_cny",
      nonCnyCurrency: "USDT",
      amount: 1000,
      amountSide: "source",
      providerRate: null,
      tiers: TIERS,
      markupRate: NO_MARKUP,
    });
    const marked = priceCnyConversion({
      direction: "to_cny",
      nonCnyCurrency: "USDT",
      amount: 1000,
      amountSide: "source",
      providerRate: null,
      tiers: TIERS,
      markupRate: TWO_PERCENT,
    });

    assert.ok(raw && marked);
    // What they pay is identical — the markup must not touch the source side.
    assert.equal(marked.sourceAmount, 1000);
    assert.equal(marked.sourceAmount, raw.sourceAmount);
    // What they receive is 2% less.
    assert.equal(raw.targetAmount, 6000);
    assert.equal(marked.targetAmount, 5880);
    assert.ok(marked.targetAmount < raw.targetAmount);
  });

  test("selling yuan: the markup reduces the USDT CREDITED, not the yuan spent", () => {
    const marked = priceCnyConversion({
      direction: "from_cny",
      nonCnyCurrency: "USDT",
      amount: 6000,
      amountSide: "source",
      providerRate: null,
      tiers: TIERS,
      markupRate: TWO_PERCENT,
    });
    assert.ok(marked);
    assert.equal(marked.sourceCurrency, "CNY");
    assert.equal(marked.sourceAmount, 6000, "the yuan they spend is untouched");
    assert.equal(marked.targetCurrency, "USDT");
    assert.equal(marked.targetAmount, 980, "1000 USDT less the 2% markup");
    assert.equal(marked.rawTargetAmount, 1000);
  });

  test("the margin is the gap between raw and credited, in the target currency", () => {
    const price = priceCnyConversion({
      direction: "to_cny",
      nonCnyCurrency: "USDT",
      amount: 1000,
      amountSide: "source",
      providerRate: null,
      tiers: TIERS,
      markupRate: TWO_PERCENT,
    });
    assert.ok(price);
    assert.equal(price.rawTargetAmount - price.targetAmount, 120);
  });

  test("a zero markup leaves the raw figure exactly as it was", () => {
    const price = priceCnyConversion({
      direction: "to_cny",
      nonCnyCurrency: "USDT",
      amount: 1000,
      amountSide: "source",
      providerRate: null,
      tiers: TIERS,
      markupRate: NO_MARKUP,
    });
    assert.ok(price);
    assert.equal(price.targetAmount, price.rawTargetAmount);
  });
});

describe("the fiat leg", () => {
  test("a fiat payer's amount passes through the provider rate before the ladder", () => {
    // 1,500,000 NGN at 1/1500 USDT per naira is 1,000 USDT, which buys 6,000
    // yuan in the small band before markup.
    const price = priceCnyConversion({
      direction: "to_cny",
      nonCnyCurrency: "NGN",
      amount: 1_500_000,
      amountSide: "source",
      providerRate: 1 / 1500,
      tiers: TIERS,
      markupRate: TWO_PERCENT,
    });
    assert.ok(price);
    assert.equal(price.sourceCurrency, "NGN");
    assert.equal(price.sourceAmount, 1_500_000);
    assert.equal(price.rawTargetAmount, 6000);
    assert.equal(price.targetAmount, 5880);
  });

  test("a USDT payer has no fiat leg at all, and the rate stays null", () => {
    const price = priceCnyConversion({
      direction: "to_cny",
      nonCnyCurrency: "USDT",
      amount: 1000,
      amountSide: "source",
      providerRate: null,
      tiers: TIERS,
      markupRate: TWO_PERCENT,
    });
    assert.ok(price);
    assert.equal(price.providerRate, null);
    assert.equal(price.sourceUsdtRate, 1);
  });
});

describe("which field the user typed in", () => {
  test("typing the yuan the recipient should get resolves the band off that figure", () => {
    // 12,600 CNY is already in CNY, so the band comes from it DIRECTLY (the
    // reverse resolver) rather than from a forward walk on a USDT guess —
    // which is the trap solveCnySpend exists to avoid.
    const price = priceCnyConversion({
      direction: "to_cny",
      nonCnyCurrency: "USDT",
      amount: 12_600,
      amountSide: "target",
      providerRate: null,
      tiers: TIERS,
      markupRate: NO_MARKUP,
    });
    assert.ok(price);
    assert.equal(price.tierRate, 6.3, "12,600 CNY is in the large band");
    assert.equal(price.sourceAmount, 2000);
  });

  test("a bigger order escalates up the ladder to the better band", () => {
    // 2,000 USDT at the small band's 6.0 would be 12,000 CNY, which overshoots
    // that band's 10,000 ceiling — so the order is really a large one and the
    // 6.3 band applies.
    const price = priceCnyConversion({
      direction: "to_cny",
      nonCnyCurrency: "USDT",
      amount: 2000,
      amountSide: "source",
      providerRate: null,
      tiers: TIERS,
      markupRate: NO_MARKUP,
    });
    assert.ok(price);
    assert.equal(price.tierRate, 6.3);
    assert.equal(price.targetAmount, 12_600);
  });

  test("a small order lands in the small band and gets the worse rate", () => {
    const price = priceCnyConversion({
      direction: "to_cny",
      nonCnyCurrency: "USDT",
      amount: 100,
      amountSide: "source",
      providerRate: null,
      tiers: TIERS,
      markupRate: NO_MARKUP,
    });
    assert.ok(price);
    assert.equal(price.tierRate, 6.0);
    assert.equal(price.targetAmount, 600);
  });

  test("customerRate is target per source, after markup — the figure a receipt can check", () => {
    const price = priceCnyConversion({
      direction: "to_cny",
      nonCnyCurrency: "USDT",
      amount: 1000,
      amountSide: "source",
      providerRate: null,
      tiers: TIERS,
      markupRate: TWO_PERCENT,
    });
    assert.ok(price);
    assert.equal(price.customerRate, 5.88);
    assert.ok(
      price.customerRate < price.tierRate,
      "the customer's rate is always worse than the band's",
    );
  });
});

describe("refusals", () => {
  test("an unconfigured ladder prices nothing rather than guessing", () => {
    assert.equal(
      priceCnyConversion({
        direction: "to_cny",
        nonCnyCurrency: "USDT",
        amount: 1000,
        amountSide: "source",
        providerRate: null,
        tiers: [],
        markupRate: TWO_PERCENT,
      }),
      null,
    );
  });

  test("a non-positive or non-finite amount is refused", () => {
    for (const amount of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(
        priceCnyConversion({
          direction: "to_cny",
          nonCnyCurrency: "USDT",
          amount,
          amountSide: "source",
          providerRate: null,
          tiers: TIERS,
          markupRate: TWO_PERCENT,
        }),
        null,
        `amount ${amount} should not price`,
      );
    }
  });

  test("an order above the top band still prices — the ladder caps the RATE, not the size", () => {
    // The top row is a floor on how good the rate gets, not a limit on how
    // much can be converted. An order past it takes the top band rather than
    // being refused.
    const price = priceCnyConversion({
      direction: "to_cny",
      nonCnyCurrency: "USDT",
      amount: 1_000_000,
      amountSide: "source",
      providerRate: null,
      tiers: TIERS,
      markupRate: NO_MARKUP,
    });
    assert.ok(price);
    assert.equal(price.tierRate, 6.3, "the best band, and no better");
    assert.equal(price.targetAmount, 6_300_000);
  });
});

describe("cnyRouteBlocker", () => {
  test("yuan to yuan is not a conversion", () => {
    assert.match(cnyRouteBlocker("CNY") ?? "", /two different wallets/i);
  });

  test("dollars are blocked, with the standing reason rather than a pricing failure", () => {
    assert.match(cnyRouteBlocker("USD") ?? "", /aren't open yet/i);
  });

  test("cedis say maintenance", () => {
    assert.match(cnyRouteBlocker("GHS") ?? "", /maintenance/i);
  });

  test("no blocker names a provider or says 'exchange'", () => {
    for (const currency of ["CNY", "USD", "GHS", "NGN", "KES", "USDT"] as const) {
      const reason = cnyRouteBlocker(currency) ?? "";
      assert.doesNotMatch(reason, /busha|klasha/i, `${currency} names a provider`);
      assert.doesNotMatch(reason, /exchange/i, `${currency} says "exchange"`);
    }
  });

  test("the open corridors are not blocked", () => {
    assert.equal(cnyRouteBlocker("NGN"), null);
    assert.equal(cnyRouteBlocker("KES"), null);
    assert.equal(cnyRouteBlocker("USDT"), null);
  });
});

describe("indicativeCnyRate", () => {
  test("takes the LOWEST band — an indicative figure must err against the customer", () => {
    assert.equal(indicativeCnyRate(TIERS), 6.0);
  });

  test("null when nothing is configured, rather than a fabricated rate", () => {
    assert.equal(indicativeCnyRate([]), null);
  });
});

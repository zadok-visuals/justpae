import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buyPriceFromFiatToUsdtRate,
  sellPriceFromUsdtToFiatRate,
  bridgeLegPrices,
} from "./pairPricing.ts";
import { applyMarkupToRate } from "./markupMath.ts";

/**
 * The two numbers a customer is quoted, and the one property that matters
 * about them: the markup must make BOTH sides worse for the customer, even
 * though one of them is reached by inverting a rate and the other is not.
 *
 * Inverting is exactly where a sign error hides. `1 / (rate * (1 - markup))`
 * is larger than `1 / rate` — the customer pays MORE per USDT — and that is
 * correct, but it looks like the markup went the wrong way if you only read
 * the formula. These tests pin the direction down with real figures from this
 * account (USDT/NGN buy 1380.72, sell 1364.26).
 */

const BUY = 1380.72; // NGN the provider charges for 1 USDT
const SELL = 1364.26; // NGN the provider pays for 1 USDT
const MARKUP = 0.005;

describe("buyPriceFromFiatToUsdtRate", () => {
  test("inverts a USDT-per-fiat rate into fiat per USDT", () => {
    const providerRate = 1 / BUY; // what routes.ts resolves for fiat -> USDT
    assert.ok(Math.abs(buyPriceFromFiatToUsdtRate(providerRate)! - BUY) < 1e-9);
  });

  test("the markup makes the customer pay MORE per USDT, not less", () => {
    const providerRate = 1 / BUY;
    const customerRate = applyMarkupToRate(providerRate, MARKUP);

    const providerPrice = buyPriceFromFiatToUsdtRate(providerRate)!;
    const customerPrice = buyPriceFromFiatToUsdtRate(customerRate)!;

    assert.ok(
      customerPrice > providerPrice,
      `customer should pay more per USDT: ${customerPrice} vs ${providerPrice}`,
    );
    // 0.5% fewer USDT per naira is 1/(1-0.005) more naira per USDT.
    assert.ok(Math.abs(customerPrice - BUY / (1 - MARKUP)) < 1e-9);
  });

  test("refuses a rate that cannot be inverted", () => {
    assert.equal(buyPriceFromFiatToUsdtRate(0), null);
    assert.equal(buyPriceFromFiatToUsdtRate(-1), null);
    assert.equal(buyPriceFromFiatToUsdtRate(Number.NaN), null);
  });
});

describe("sellPriceFromUsdtToFiatRate", () => {
  test("a USDT -> fiat rate is already the sell price", () => {
    assert.equal(sellPriceFromUsdtToFiatRate(SELL), SELL);
  });

  test("the markup makes the customer receive LESS per USDT", () => {
    const customerPrice = sellPriceFromUsdtToFiatRate(applyMarkupToRate(SELL, MARKUP))!;
    assert.ok(customerPrice < SELL);
    assert.ok(Math.abs(customerPrice - SELL * (1 - MARKUP)) < 1e-9);
  });

  test("refuses a nonsense rate", () => {
    assert.equal(sellPriceFromUsdtToFiatRate(0), null);
    assert.equal(sellPriceFromUsdtToFiatRate(Number.POSITIVE_INFINITY), null);
  });
});

describe("bridgeLegPrices", () => {
  // NGN -> KES, priced the way routes.ts prices it: sell NGN into USDT at
  // NGN's buy price, buy KES out of USDT at KES's sell price.
  const KES_SELL = 128.11;
  const sourceUsdtRate = 1 / BUY;
  const providerRate = sourceUsdtRate * KES_SELL;

  test("recovers both leg prices from what the route already carries", () => {
    const legs = bridgeLegPrices({ sourceUsdtRate, providerRate })!;
    assert.ok(Math.abs(legs.buyPrice - BUY) < 1e-9);
    assert.ok(Math.abs(legs.sellPrice - KES_SELL) < 1e-9);
  });

  test("the legs and the single spread reconcile with the settled rate", () => {
    // THE invariant this whole presentation rests on. The confirm dialog
    // shows two leg prices AND a spread AND a composite rate; if a reader
    // multiplies them out they must land on the composite, or the dialog is
    // showing them three numbers that disagree about their own money.
    const legs = bridgeLegPrices({ sourceUsdtRate, providerRate })!;
    const customerRate = applyMarkupToRate(providerRate, MARKUP);

    const fromLegs = (1 / legs.buyPrice) * legs.sellPrice * (1 - MARKUP);
    assert.ok(
      Math.abs(fromLegs - customerRate) < 1e-12,
      `legs should reconcile with the settled rate: ${fromLegs} vs ${customerRate}`,
    );
  });

  test("the spread is counted ONCE across the bridge, not once per leg", () => {
    // Applying the markup per leg would charge the customer twice for one
    // conversion — the thing executeBridgedConversion is written to avoid.
    // These leg prices are therefore the raw provider ones.
    const legs = bridgeLegPrices({ sourceUsdtRate, providerRate })!;
    assert.equal(legs.buyPrice, BUY);
    assert.equal(legs.sellPrice, KES_SELL);
  });

  test("refuses an unusable route rather than producing Infinity", () => {
    assert.equal(bridgeLegPrices({ sourceUsdtRate: 0, providerRate }), null);
    assert.equal(bridgeLegPrices({ sourceUsdtRate, providerRate: 0 }), null);
  });
});

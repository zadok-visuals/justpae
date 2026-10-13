import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MARKUP_RATE,
  applyMarkupToAmount,
  applyMarkupToRate,
  marginOnOrder,
  round2,
} from "./markupMath.ts";

/**
 * The conversion quote maths.
 *
 * THE BUG THESE EXIST TO CATCH is a sign flip. `1 + markup` instead of
 * `1 - markup` reads almost identically, passes every type check, and produces
 * a perfectly plausible number — it just quotes the customer a better rate than
 * the provider gave us and pays the difference out of our own pocket on every
 * single order, silently, until somebody looks at the margin report.
 */

test("the customer rate is worse than the provider rate, never better", () => {
  const provider = 1600;
  const customer = applyMarkupToRate(provider, 0.005);

  assert.ok(customer < provider, "a markup must reduce what the customer receives");
  assert.equal(customer, 1592);
});

test("a zero markup leaves the rate untouched", () => {
  assert.equal(applyMarkupToRate(1600, 0), 1600);
});

test("the default markup is 0.5%, expressed as a fraction and not a percentage", () => {
  // The whole failure mode of this constant is somebody writing 0.5 meaning
  // "0.5%". At 0.5 the customer receives HALF their money.
  assert.equal(DEFAULT_MARKUP_RATE, 0.005);
  assert.ok(DEFAULT_MARKUP_RATE < 1, "a markup is a fraction, not a percentage");
  assert.equal(applyMarkupToRate(1000, DEFAULT_MARKUP_RATE), 995);
});

test("markup on an amount behaves the same way as markup on a rate", () => {
  // Marking up the rate and then multiplying must equal multiplying and then
  // marking up the amount. If these ever disagree, the quote the customer
  // confirmed and the amount they were credited are computed differently.
  const providerRate = 1600;
  const markup = 0.0125;
  const sourceAmount = 250;

  const viaRate = sourceAmount * applyMarkupToRate(providerRate, markup);
  const viaAmount = applyMarkupToAmount(sourceAmount * providerRate, markup);

  assert.ok(Math.abs(viaRate - viaAmount) < 1e-9, `${viaRate} vs ${viaAmount}`);
});

test("margin is what the provider delivered minus what the customer got", () => {
  const raw = 400_000;
  const credited = applyMarkupToAmount(raw, 0.005);

  assert.equal(marginOnOrder(raw, credited), 2000);
  assert.ok(marginOnOrder(raw, credited) > 0, "margin must be positive on a marked-up order");
});

test("margin is zero, not negative, when no markup was applied", () => {
  const raw = 400_000;
  assert.equal(marginOnOrder(raw, applyMarkupToAmount(raw, 0)), 0);
});

test("round2 rounds to the minor unit", () => {
  assert.equal(round2(1234.5678), 1234.57);
  assert.equal(round2(0.005), 0.01);
  assert.equal(round2(10), 10);
});

test("a realistic NGN quote survives the whole pipeline", () => {
  // 250 USDT at 1,600 NGN/USDT with the default 0.5% spread.
  const customerRate = applyMarkupToRate(1600, DEFAULT_MARKUP_RATE);
  const targetAmount = round2(250 * customerRate);

  assert.equal(customerRate, 1592);
  assert.equal(targetAmount, 398_000);
  // What the provider would have delivered unmarked, and the gap we keep.
  assert.equal(round2(marginOnOrder(250 * 1600, targetAmount)), 2000);
});

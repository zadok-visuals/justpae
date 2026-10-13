import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MINIMUM_WITHDRAWAL_USDT_THRESHOLD,
  getMinimumWithdrawalAmount,
} from "./limits.ts";

/**
 * The withdrawal minimum, stated in the currency the user is holding.
 *
 * THE PROPERTY THAT MATTERS, and the reason this rounds UP rather than to
 * nearest: the figure shown to the customer must never be one the server would
 * then reject. Round 3,125 naira down to 3,000 and the screen says "minimum
 * ₦3,000", the customer types exactly that, and the server — which compares
 * amount × rate against 5 USD — refuses it. That is the worst possible
 * outcome: the app contradicting itself about its own rule.
 */

// 1 NGN ≈ 0.000625 USD, i.e. 1,600 NGN to the dollar.
const NGN_PER_USD = 1600;
const USD_PER_NGN = 1 / NGN_PER_USD;

test("dollars and USDT are the threshold itself, with no conversion", () => {
  assert.equal(getMinimumWithdrawalAmount("USD"), MINIMUM_WITHDRAWAL_USDT_THRESHOLD);
  assert.equal(getMinimumWithdrawalAmount("USDT"), MINIMUM_WITHDRAWAL_USDT_THRESHOLD);
  // A rate is irrelevant for these and must not change the answer.
  assert.equal(getMinimumWithdrawalAmount("USD", 0.5), MINIMUM_WITHDRAWAL_USDT_THRESHOLD);
});

test("a local minimum converts the same 5 USD floor the server gates on", () => {
  const minimum = getMinimumWithdrawalAmount("NGN", USD_PER_NGN);
  assert.ok(minimum !== null);

  // 5 USD at 1,600/USD is 8,000 naira exactly.
  assert.equal(minimum, 8000);
});

test("THE INVARIANT: the amount shown always clears the server's own check", () => {
  // Swept across a range of plausible rates, including ones that do not divide
  // evenly into the rounding step — which is exactly where a round-to-nearest
  // would produce a figure the server rejects.
  for (const ngnPerUsd of [900, 1234, 1499, 1600, 1601, 1777, 2050, 3333]) {
    const usdPerNgn = 1 / ngnPerUsd;
    const shown = getMinimumWithdrawalAmount("NGN", usdPerNgn);
    assert.ok(shown !== null, `no minimum at ${ngnPerUsd}`);

    // This is the server's comparison, in src/lib/actions/withdrawals.ts.
    const equivalentUsd = shown * usdPerNgn;
    assert.ok(
      equivalentUsd >= MINIMUM_WITHDRAWAL_USDT_THRESHOLD,
      `at ${ngnPerUsd} NGN/USD the shown minimum ${shown} is only ${equivalentUsd} USD`,
    );
  }
});

test("the figure is rounded to something a person would actually type", () => {
  // 5 USD at 1,234 NGN/USD is 6,170 exactly; at 1,499 it is 7,495, which must
  // come back as a round number rather than as 7,495.
  const minimum = getMinimumWithdrawalAmount("NGN", 1 / 1499);
  assert.ok(minimum !== null);
  assert.equal(minimum % 100, 0, `${minimum} is not a round figure`);
});

test("no rate means no number, rather than an invented one", () => {
  // The screen prints the USD floor instead. Quoting a local minimum with no
  // live rate behind it would be making one up.
  assert.equal(getMinimumWithdrawalAmount("NGN", null), null);
  assert.equal(getMinimumWithdrawalAmount("NGN", undefined), null);
  assert.equal(getMinimumWithdrawalAmount("NGN", 0), null);
  assert.equal(getMinimumWithdrawalAmount("NGN", -1), null);
});

test("a currency with no rounding step of its own still returns a whole number", () => {
  const minimum = getMinimumWithdrawalAmount("XYZ", 0.1);
  assert.ok(minimum !== null);
  assert.equal(minimum, Math.ceil(minimum), "must be a whole unit");
  assert.ok(minimum * 0.1 >= MINIMUM_WITHDRAWAL_USDT_THRESHOLD);
});

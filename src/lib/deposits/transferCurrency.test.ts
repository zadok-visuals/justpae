import { test } from "node:test";
import assert from "node:assert/strict";
import { transferCurrencyMatches } from "./transferCurrency.ts";

/**
 * GROUP 7. The saved deposit's currency must be the one the provider's
 * confirmed transfer is actually denominated in — never just whatever the
 * form happened to submit. See transferCurrency.ts for the race this guards
 * against.
 */

test("a transfer confirmed in the same currency the form requested matches", () => {
  for (const currency of ["NGN", "KES", "USDT", "GHS"]) {
    assert.equal(transferCurrencyMatches(currency, currency), true);
  }
});

test("a transfer confirmed in a different currency than the form requested does not match", () => {
  assert.equal(transferCurrencyMatches("NGN", "KES"), false);
  assert.equal(transferCurrencyMatches("KES", "NGN"), false);
  assert.equal(transferCurrencyMatches("USDT", "NGN"), false);
});

test("the comparison is exact, not case-insensitive — a provider sending a different case is itself a signal something is wrong, not something to paper over", () => {
  assert.equal(transferCurrencyMatches("NGN", "ngn"), false);
});

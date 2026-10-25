import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KORAPAY_PAYOUT_CURRENCIES,
  isKorapayPayoutCurrency,
  parsePayoutRoute,
  resolvePayoutRoute,
} from "./route.ts";
import type { Currency } from "../types/database.ts";

/**
 * One property, asserted from several directions: NOTHING reroutes a payout
 * to Korapay except a deliberate yes from both the flag and the setting.
 * Every other input — missing, misspelled, hostile, a currency Korapay cannot
 * serve — lands on Busha, which is the rail that works today.
 */

test("Busha is the default, and the default survives every unusable setting", () => {
  for (const value of [null, undefined, "", "   ", "KORA", "busha", "korapays", "true", "1"]) {
    assert.equal(resolvePayoutRoute("NGN", value, true), "busha", JSON.stringify(value));
  }
});

test("Korapay needs both the flag and the setting", () => {
  assert.equal(resolvePayoutRoute("NGN", "korapay", true), "korapay");
  // The setting alone is not enough: an admin toggling a dial on a deployment
  // that has no Korapay credentials must not take the naira rail down.
  assert.equal(resolvePayoutRoute("NGN", "korapay", false), "busha");
  // And the flag alone is not enough either.
  assert.equal(resolvePayoutRoute("NGN", null, true), "busha");
});

test("only the currencies Korapay can actually pay out are routable", () => {
  assert.deepEqual(KORAPAY_PAYOUT_CURRENCIES, ["NGN", "KES"]);

  for (const currency of ["NGN", "KES"] as Currency[]) {
    assert.equal(isKorapayPayoutCurrency(currency), true, currency);
    assert.equal(resolvePayoutRoute(currency, "korapay", true), "korapay", currency);
  }

  // GHS is locked as a whole wallet; USDT has no Korapay rail at all; USD and
  // CNY are not withdrawn this way. A setting naming Korapay for any of them
  // is ignored rather than honoured into a payout that cannot be made.
  for (const currency of ["GHS", "USDT", "USD", "CNY"] as Currency[]) {
    assert.equal(isKorapayPayoutCurrency(currency), false, currency);
    assert.equal(resolvePayoutRoute(currency, "korapay", true), "busha", currency);
  }
});

test("the stored value is normalised, not trusted verbatim", () => {
  // What an admin form writes is already constrained, but app_settings is a
  // text column and this is the function that decides where money goes.
  assert.equal(parsePayoutRoute("korapay"), "korapay");
  assert.equal(parsePayoutRoute("  KoraPay  "), "korapay");
  assert.equal(parsePayoutRoute("KORAPAY"), "korapay");
  assert.equal(parsePayoutRoute("korapay; drop table"), "busha");
  assert.equal(parsePayoutRoute(null), "busha");
});

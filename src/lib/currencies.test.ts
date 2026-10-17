import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURRENCIES,
  CURRENCY_CODES,
  USD_CONVERSION_UNAVAILABLE,
  isUsdPair,
  localCurrencyForCountry,
} from "./currencies.ts";

/**
 * The currency config and the one shared USD refusal.
 *
 * THE BUG THESE EXIST TO CATCH is a USD pair quietly falling back to a
 * generic failure. USD cannot be converted at all on this account — there is
 * no USDT/USD pair — and the one thing that must never happen is a user
 * picking USD, typing an amount, entering a PIN and only then meeting "rates
 * are unavailable right now". isUsdPair is the predicate every surface uses
 * to decide that, so a hole in it is a hole everywhere at once.
 */

test("isUsdPair catches USD on EITHER side, not just the source", () => {
  assert.equal(isUsdPair("USD", "NGN"), true, "USD as the source");
  assert.equal(isUsdPair("NGN", "USD"), true, "USD as the destination");
  // The one that is easy to miss: USDT is a different currency, and a
  // substring or startsWith check would wrongly catch it.
  assert.equal(isUsdPair("USD", "USDT"), true, "USD to USDT has no pair either");
  assert.equal(isUsdPair("USDT", "NGN"), false, "USDT is not USD");
  assert.equal(isUsdPair("NGN", "USDT"), false);
  assert.equal(isUsdPair("NGN", "KES"), false);
});

test("the USD message explains the cause and never reads as a passing outage", () => {
  // "try again" wording is exactly what this message replaces: the state is
  // standing, not transient, and telling the user to retry wastes their time.
  assert.ok(
    !/try again|temporar|right now/i.test(USD_CONVERSION_UNAVAILABLE),
    "must not imply retrying will help",
  );
  // It has to say what unblocks it, or it is just a refusal.
  assert.match(USD_CONVERSION_UNAVAILABLE, /receiving/i);
});

test("no customer-facing currency copy says 'exchange'", () => {
  // Customer copy says "convert" throughout — see the working rules.
  for (const meta of CURRENCIES) {
    assert.ok(!/exchange/i.test(meta.label), `${meta.code} label says "exchange"`);
  }
  assert.ok(!/exchange/i.test(USD_CONVERSION_UNAVAILABLE));
});

test("every currency is listed exactly once and USD is among them", () => {
  assert.equal(new Set(CURRENCY_CODES).size, CURRENCY_CODES.length, "duplicate currency code");
  assert.ok(CURRENCY_CODES.includes("USD"), "USD is held, just not convertible");
});

test("a country maps to at most one local currency", () => {
  const countries = CURRENCIES.map((c) => c.country).filter(Boolean);
  assert.equal(new Set(countries).size, countries.length, "two currencies claim one country");
  assert.equal(localCurrencyForCountry("NG"), "NGN");
  assert.equal(localCurrencyForCountry("US"), null, "USD is not a signup local currency");
  assert.equal(localCurrencyForCountry(null), null);
});

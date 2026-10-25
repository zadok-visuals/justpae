import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURRENCIES,
  CURRENCY_CODES,
  USD_CONVERSION_UNAVAILABLE,
  formatAmount,
  formatRate,
  formatSignedAmount,
  isUsdPair,
  localCurrencyForCountry,
  splitAmount,
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

test("the USD message reads as maintenance, not a passing outage or a bare refusal", () => {
  // "try again" wording is exactly what this message replaces: the state is
  // standing, not transient, and telling the user to retry wastes their time.
  assert.ok(
    !/try again|temporar|right now/i.test(USD_CONVERSION_UNAVAILABLE),
    "must not imply retrying will help",
  );
  // GROUP 2 — the USD wallet is its own maintenance service now (see
  // src/lib/services.ts), matching every other locked wallet's wording.
  assert.match(USD_CONVERSION_UNAVAILABLE, /maintenance/i);
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

/**
 * THE CURRENCY-CODE RULE. No symbol — not ₦, ₮, ¥, ₵, $ or "KSh" — appears
 * anywhere a number is shown. The code goes first, then one space, then the
 * grouped number. These tests are the gate: the symbols are written out as
 * literals so a regression is caught by the suite rather than by a customer
 * reading a receipt.
 */

const BANNED_SYMBOLS = ["₦", "₮", "¥", "₵", "$", "KSh"];

test("formatAmount prints the ISO code before the number, with one space", () => {
  assert.equal(formatAmount("NGN", 5000), "NGN 5,000.00");
  assert.equal(formatAmount("USDT", 10), "USDT 10.00");
  assert.equal(formatAmount("CNY", 200), "CNY 200.00");
  assert.equal(formatAmount("KES", 500), "KES 500.00");
  assert.equal(formatAmount("GHS", 0), "GHS 0.00");
  assert.equal(formatAmount("USD", 0), "USD 0.00");
});

test("no formatter emits a currency symbol, for any currency", () => {
  for (const meta of CURRENCIES) {
    const rendered = [
      formatAmount(meta.code, 1234.5),
      formatSignedAmount(meta.code, 1234.5, "in"),
      formatSignedAmount(meta.code, 1234.5, "out"),
      formatRate("USDT", meta.code, 1392.01),
    ].join(" ");

    for (const symbol of BANNED_SYMBOLS) {
      assert.ok(
        !rendered.includes(symbol),
        `${meta.code} rendered "${symbol}": ${rendered}`,
      );
    }
  }
});

test("no currency's flag is a symbol standing in for a missing flag", () => {
  // USDT's flag used to be "₮", which the rule above would otherwise miss:
  // it is drawn beside a balance, not inside one.
  for (const meta of CURRENCIES) {
    for (const symbol of BANNED_SYMBOLS) {
      assert.ok(!meta.flag.includes(symbol), `${meta.code}'s flag is "${meta.flag}"`);
    }
  }
});

test("a signed amount keeps the sign outside the code", () => {
  assert.equal(formatSignedAmount("NGN", 5000, "in"), "+NGN 5,000.00");
  // A true minus sign, not a hyphen.
  assert.equal(formatSignedAmount("NGN", 5000, "out"), "−NGN 5,000.00");
  // The direction decides the sign, not the number's own sign.
  assert.equal(formatSignedAmount("NGN", -5000, "in"), "+NGN 5,000.00");
});

test("a rate reads '1 USDT = NGN 1,392.01'", () => {
  assert.equal(formatRate("USDT", "NGN", 1392.01), "1 USDT = NGN 1,392.01");
  // Sub-1 rates keep six decimals, so a naira-to-USDT quote isn't rounded to
  // "NGN 0.00".
  assert.equal(formatRate("NGN", "USDT", 0.000724), "1 NGN = USDT 0.000724");
});

test("splitAmount agrees with formatAmount about grouping and decimals", () => {
  for (const meta of CURRENCIES) {
    const { code, whole, decimals } = splitAmount(meta.code, 1234567.891);
    assert.equal(
      `${code} ${whole}.${decimals}`,
      formatAmount(meta.code, 1234567.891),
      `${meta.code} splits differently from how it formats`,
    );
  }
  // The Amount component renders the sign itself, so the split is unsigned.
  assert.equal(splitAmount("NGN", -5000).whole, "5,000");
});

test("a country maps to at most one local currency", () => {
  const countries = CURRENCIES.map((c) => c.country).filter(Boolean);
  assert.equal(new Set(countries).size, countries.length, "two currencies claim one country");
  assert.equal(localCurrencyForCountry("NG"), "NGN");
  assert.equal(localCurrencyForCountry("US"), null, "USD is not a signup local currency");
  assert.equal(localCurrencyForCountry(null), null);
});

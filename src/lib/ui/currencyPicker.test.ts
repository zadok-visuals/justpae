import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminCurrencyOptions,
  convertPickerOptions,
  currencyPickerRank,
  depositPickerOptions,
  fundingPickerOptions,
  payoutAccountPickerOptions,
  sortCurrencyOptions,
  walletLockLabel,
  withdrawPickerOptions,
} from "./currencyPicker.ts";
import { CURRENCY_CODES } from "../currencies.ts";
import type { Currency } from "../types/database.ts";

/**
 * GROUP 1 — the rules behind every currency list in the product.
 *
 * These run with the flags at their shipped defaults: the GHS and USD
 * wallets are both off, which is the state production is in and therefore
 * the state the ordering has to be right in.
 */

function wallets(balances: Partial<Record<Currency, number>>) {
  return CURRENCY_CODES.map((currency) => ({
    currency,
    balance: balances[currency] ?? 0,
  }));
}

const codesOf = (options: { currency: Currency }[]) => options.map((o) => o.currency);
const pillOf = (options: { currency: Currency; pill?: string }[], currency: Currency) =>
  options.find((o) => o.currency === currency)?.pill;

test("the order is local fiat, then USDT, then yuan, then the switched-off ones", () => {
  assert.deepEqual(
    codesOf(adminCurrencyOptions([...CURRENCY_CODES])),
    ["NGN", "KES", "USDT", "CNY", "GHS", "USD"],
  );
});

test("an unavailable currency sinks below every available one, whatever it is", () => {
  // A naira wallet whose rail is down must not keep first place in a list it
  // cannot be picked from.
  const sorted = sortCurrencyOptions([
    { currency: "USD" as Currency, disabled: true },
    { currency: "NGN" as Currency, disabled: true },
    { currency: "CNY" as Currency },
    { currency: "USDT" as Currency },
  ]);
  assert.deepEqual(codesOf(sorted), ["USDT", "CNY", "NGN", "USD"]);
});

test("rank covers every currency, so nothing falls off the end by accident", () => {
  for (const code of CURRENCY_CODES) {
    assert.ok(currencyPickerRank(code) < CURRENCY_CODES.length, `${code} is unranked`);
  }
});

test("USD and GHS both say Soon while locked", () => {
  // The dollar wallet has never opened; cedi rails exist and are down. Both
  // render the same word now — the distinction stays in `kind`, not the label.
  assert.equal(walletLockLabel("USD"), "Soon");
  assert.equal(walletLockLabel("GHS"), "Soon");
  assert.equal(walletLockLabel("NGN"), null);
  assert.equal(walletLockLabel("USDT"), null);
  assert.equal(walletLockLabel("CNY"), null);
});

test("deposit drops yuan entirely rather than listing a reason", () => {
  const options = depositPickerOptions(wallets({ NGN: 1000 }));
  assert.ok(!codesOf(options).includes("CNY"), "yuan is bought, not deposited");
  // USDT is the only live rail here: with neither naira flag on and
  // KES_DEPOSIT_ENABLED off, NGN and KES are both disabled and sort below
  // every available row regardless of picker rank.
  assert.deepEqual(codesOf(options), ["USDT", "NGN", "KES", "GHS", "USD"]);
});

test("deposit marks USD, GHS, NGN and KES all Soon by default", () => {
  const options = depositPickerOptions(wallets({}));
  assert.equal(pillOf(options, "USD"), "Soon");
  assert.equal(pillOf(options, "GHS"), "Soon");
  assert.equal(pillOf(options, "NGN"), "Soon");
  assert.equal(pillOf(options, "KES"), "Soon");
  for (const code of ["USD", "GHS", "NGN", "KES"] as Currency[]) {
    assert.equal(options.find((o) => o.currency === code)?.disabled, true);
  }
});

test("withdraw drops yuan, which the database refuses outright", () => {
  const options = withdrawPickerOptions(wallets({ NGN: 500 }), ["NGN"]);
  assert.ok(!codesOf(options).includes("CNY"));
});

test("a currency with no payout account is pickable and opens the form", () => {
  const options = withdrawPickerOptions(wallets({ NGN: 500, KES: 20 }), ["NGN"]);
  const kes = options.find((o) => o.currency === "KES")!;
  // GROUP 1d: "Setup" was a dead word on a greyed-out row. Nothing is wrong
  // with the currency — the user has a thing to do, and the row does it.
  assert.equal(kes.pill, "Add payout account");
  assert.equal(kes.disabled, undefined);
  assert.equal(kes.href, "/profile");

  const ngn = options.find((o) => o.currency === "NGN")!;
  assert.equal(ngn.pill, undefined);
  assert.equal(ngn.href, undefined);
});

test("withdraw shows balances and keeps the locked wallets at the bottom", () => {
  const options = withdrawPickerOptions(wallets({ NGN: 500 }), ["NGN"]);
  assert.equal(options[0]?.currency, "NGN");
  assert.equal(options[0]?.balance, 500);
  assert.deepEqual(codesOf(options).slice(-2), ["GHS", "USD"]);
  assert.equal(pillOf(options, "USD"), "Soon");
});

test("convert KEEPS yuan — it is the only screen that can buy it", () => {
  const options = convertPickerOptions(wallets({ NGN: 1 }));
  assert.ok(codesOf(options).includes("CNY"));
  assert.equal(options.find((o) => o.currency === "CNY")?.disabled, undefined);
});

test("convert carries the route's own word, not a generic 'unavailable'", () => {
  const options = convertPickerOptions(wallets({}), {
    blockedKinds: { KES: "Maintenance" },
  });
  const kes = options.find((o) => o.currency === "KES")!;
  assert.equal(kes.pill, "Maintenance");
  assert.equal(kes.disabled, true);
  // And a blocked route sinks: available rows come first.
  assert.equal(options[0]?.currency, "NGN");
});

test("convert only shows balances when asked to", () => {
  assert.equal(convertPickerOptions(wallets({ NGN: 7 }))[0]?.balance, undefined);
  assert.equal(
    convertPickerOptions(wallets({ NGN: 7 }), { showBalance: true })[0]?.balance,
    7,
  );
});

test("a funding picker mutes an empty wallet rather than hiding it", () => {
  const options = fundingPickerOptions(wallets({ NGN: 100 }));
  assert.equal(options.find((o) => o.currency === "NGN")?.pill, undefined);
  const usdt = options.find((o) => o.currency === "USDT")!;
  assert.equal(usdt.pill, "Empty");
  assert.equal(usdt.disabled, true);
  // Hiding it would read as the product having dropped the currency.
  assert.equal(codesOf(options).length, CURRENCY_CODES.length);
});

test("the payout-account picker pills what is already saved", () => {
  const options = payoutAccountPickerOptions(["NGN", "KES", "USDT"], ["NGN"]);
  assert.equal(pillOf(options, "NGN"), "Saved");
  assert.equal(pillOf(options, "KES"), undefined);
  assert.deepEqual(codesOf(options), ["NGN", "KES", "USDT"]);
});

test("admin filters disable nothing — a broken currency is why you filter", () => {
  const options = adminCurrencyOptions([...CURRENCY_CODES]);
  assert.ok(options.every((o) => !o.disabled && !o.pill));
});

test("no pill is ever a sentence", () => {
  // Pills sit in a 44px row beside a flag, a code, a name and a balance.
  const everyPill = [
    ...depositPickerOptions(wallets({})),
    ...withdrawPickerOptions(wallets({}), []),
    ...fundingPickerOptions(wallets({})),
    ...payoutAccountPickerOptions([...CURRENCY_CODES], ["NGN"]),
  ]
    .map((o) => o.pill)
    .filter((p): p is string => p != null);

  assert.ok(everyPill.length > 0);
  for (const pill of everyPill) {
    assert.ok(pill.length <= 20, `"${pill}" is too long for a pill`);
    assert.ok(!pill.endsWith("."), `"${pill}" is a sentence, not a state`);
  }
});

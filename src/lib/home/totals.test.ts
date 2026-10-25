import { test } from "node:test";
import assert from "node:assert/strict";
import { isDisplayCurrency, totalInLocal, totalInUsdt, type PricedWallet } from "./totals.ts";

const wallets: PricedWallet[] = [
  { currency: "NGN", balance: 1_380_000, usdtRate: 1380 },
  { currency: "USDT", balance: 250, usdtRate: 1 },
  { currency: "KES", balance: 0, usdtRate: 130 },
];

test("every wallet is converted through USDT", () => {
  const total = totalInUsdt(wallets);
  assert.equal(total.amount, 1250);
  assert.equal(total.approx, true);
  assert.deepEqual(total.excluded, []);
});

test("a locked wallet with money in it is excluded and named, never priced at zero", () => {
  const total = totalInUsdt([
    ...wallets,
    { currency: "GHS", balance: 500, usdtRate: 15, locked: true },
  ]);
  assert.equal(total.amount, 1250);
  assert.deepEqual(total.excluded, ["GHS"]);
});

test("a wallet whose pair cannot be priced is excluded, not counted as zero", () => {
  const total = totalInUsdt([
    { currency: "USDT", balance: 100, usdtRate: 1 },
    { currency: "GHS", balance: 500, usdtRate: null },
  ]);
  assert.equal(total.amount, 100);
  assert.deepEqual(total.excluded, ["GHS"]);
});

test("an empty locked or unpriced wallet is not worth naming", () => {
  const total = totalInUsdt([
    { currency: "USDT", balance: 100, usdtRate: 1 },
    { currency: "GHS", balance: 0, usdtRate: null },
    { currency: "USD", balance: 0, usdtRate: 1, locked: true },
  ]);
  assert.deepEqual(total.excluded, []);
});

test("a USDT-only balance is exact, not approximate", () => {
  const total = totalInUsdt([{ currency: "USDT", balance: 40, usdtRate: 1 }]);
  assert.equal(total.amount, 40);
  assert.equal(total.approx, false);
});

test("the local total is the USDT total priced back out", () => {
  const total = totalInLocal(wallets, "NGN", 1380);
  assert.ok(total);
  assert.equal(total.amount, 1_725_000);
  assert.equal(total.approx, true);
});

test("a single-currency balance shown in that currency is exact and untouched", () => {
  const total = totalInLocal([{ currency: "NGN", balance: 1234.56, usdtRate: 1380 }], "NGN", 1380);
  assert.ok(total);
  assert.equal(total.amount, 1234.56);
  assert.equal(total.approx, false);
});

test("no local rate means no local total — never a zero", () => {
  assert.equal(totalInLocal(wallets, "GHS", null), null);
  assert.equal(totalInLocal(wallets, "GHS", 0), null);
});

test("the display-currency cookie only accepts the two values", () => {
  assert.equal(isDisplayCurrency("local"), true);
  assert.equal(isDisplayCurrency("usdt"), true);
  assert.equal(isDisplayCurrency("USDT"), false);
  assert.equal(isDisplayCurrency(undefined), false);
});

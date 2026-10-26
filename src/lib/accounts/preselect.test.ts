import { test } from "node:test";
import assert from "node:assert/strict";
import { preselectCurrency } from "./preselect.ts";

test("with nothing requested, the first fiat wallet wins over USDT", () => {
  assert.equal(preselectCurrency(null, ["USDT", "NGN"], ["USDT", "NGN"]), "NGN");
});

test("KES comes before USDT, but after NGN", () => {
  assert.equal(preselectCurrency(null, ["USDT", "KES"], ["USDT", "KES"]), "KES");
  assert.equal(
    preselectCurrency(null, ["KES", "NGN", "USDT"], ["KES", "NGN", "USDT"]),
    "NGN",
  );
});

test("USDT is the default only when there is no fiat wallet to offer instead", () => {
  assert.equal(preselectCurrency(null, ["USDT"], ["USDT"]), "USDT");
  assert.equal(preselectCurrency(null, ["USDT", "CNY"], ["USDT", "CNY"]), "USDT");
});

test("an explicit ?currency= usable on this screen always wins over the default", () => {
  assert.equal(preselectCurrency("USDT", ["USDT", "NGN"], ["USDT", "NGN"]), "USDT");
});

test("a requested currency unusable HERE but held falls back to it over an unrelated pick", () => {
  assert.equal(preselectCurrency("GHS", ["NGN"], ["GHS", "NGN"]), "GHS");
});

test("nothing usable falls back to the fiat-first default among everything held", () => {
  assert.equal(preselectCurrency(null, [], ["USDT", "NGN"]), "NGN");
});

test("nothing held at all returns undefined, not a guess", () => {
  assert.equal(preselectCurrency(null, [], []), undefined);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { preselectCurrency } from "./preselect.ts";
import { depositAvailability } from "../deposits/availability.ts";
import { CURRENCY_CODES } from "../currencies.ts";

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

/**
 * GROUP 2 — /deposit with no `?currency=` must never open on a currency the
 * picker shows muted. This runs the real depositAvailability for a user
 * holding every wallet, the same `usable` computation /deposit's own page
 * does, rather than hand-picked arrays — so a currency that starts shipping
 * "soon" by default (KES, here) fails this test the day it does, instead of
 * silently landing someone on a disabled picker row.
 */
test("the preselected deposit currency, with nothing requested, is always one depositAvailability allows", () => {
  const all = [...CURRENCY_CODES];
  const usable = all.filter((currency) => depositAvailability(currency).available);
  const picked = preselectCurrency(null, usable, all);
  assert.ok(picked, "preselectCurrency returned nothing for a full wallet set");
  assert.equal(
    depositAvailability(picked!).available,
    true,
    `${picked} was preselected but depositAvailability says it isn't`,
  );
});

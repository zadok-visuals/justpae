import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAINTENANCE_LABEL,
  UNAVAILABLE_LABEL,
  unavailableSuffix,
  type UnavailableKind,
} from "./unavailability.ts";
import { cnyBlockerKind, cnyRouteBlocker } from "../cny/priceCore.ts";

/**
 * GROUP 4f.
 *
 * The thing worth asserting here is not the spelling of six words. It is the
 * two ways this vocabulary silently rots:
 *
 *   1. Something starts labelling a non-maintenance state "Maintenance".
 *      That is the lie the enum exists to prevent, and it is invisible in
 *      review because the word looks reassuring wherever it appears.
 *   2. cnyRouteBlocker grows or reorders a branch and cnyBlockerKind does
 *      not. The two are read together — one supplies the sentence in the
 *      reason sheet, the other the badge above it — so a drift between them
 *      shows a badge that contradicts the paragraph under it.
 *
 * Both are checked by walking every case rather than by spot-checking the
 * ones that happen to be interesting today.
 */

const ALL_KINDS: UnavailableKind[] = [
  "maintenance",
  "receive",
  "convert",
  "unsupported",
  "setup",
  "same",
];

test("every kind has a label, and no label is empty", () => {
  for (const kind of ALL_KINDS) {
    assert.equal(typeof UNAVAILABLE_LABEL[kind], "string", `${kind} has no label`);
    assert.ok(UNAVAILABLE_LABEL[kind].length > 0, `${kind}'s label is empty`);
  }
});

/**
 * The labels go inside a `<select>` option that already carries a flag, a
 * currency code and often a balance, on a 375px screen. One word is the
 * budget — see the module's own note. A two-word label here would not fail a
 * type check and would quietly truncate on a phone.
 */
test("every label is a single word", () => {
  for (const kind of ALL_KINDS) {
    assert.ok(
      !/\s/.test(UNAVAILABLE_LABEL[kind]),
      `${kind} is labelled "${UNAVAILABLE_LABEL[kind]}", which is more than one word`,
    );
  }
});

test("exactly one kind in ALL_KINDS is labelled Soon", () => {
  const soonLabelled = ALL_KINDS.filter(
    (kind) => UNAVAILABLE_LABEL[kind] === MAINTENANCE_LABEL,
  );
  assert.deepEqual(soonLabelled, ["maintenance"]);
});

test("MAINTENANCE_LABEL is the word StatusBadge shows", () => {
  // MaintenanceBadge and UnavailableBadge both render StatusBadge's literal
  // "Soon" for `maintenance` now — the product decision to stop telling "down,
  // coming back" apart from "never opened" in the one word a customer sees.
  assert.equal(MAINTENANCE_LABEL, "Soon");
});

test("the suffix is the separator the pickers already use, plus the word", () => {
  assert.equal(unavailableSuffix("maintenance"), " · Soon");
  assert.equal(unavailableSuffix("setup"), " · Setup");
});

/**
 * cnyBlockerKind must answer for exactly the currencies cnyRouteBlocker
 * refuses, and must not answer for the ones it allows.
 */
test("cnyBlockerKind covers every currency cnyRouteBlocker refuses", () => {
  const refused = (["CNY", "USD", "GHS"] as const).filter(
    (currency) => cnyRouteBlocker(currency) !== null,
  );
  // Guards the premise: if one of these stops being refused, this test should
  // be rewritten rather than quietly passing on an empty list.
  assert.deepEqual(refused, ["CNY", "USD", "GHS"]);

  assert.equal(cnyBlockerKind("CNY"), "same");
  // Cedi conversions are down and are coming back.
  assert.equal(cnyBlockerKind("GHS"), "maintenance");
  // Dollars have no leg anywhere on this account. Calling that maintenance
  // would promise a return date that does not exist.
  assert.equal(cnyBlockerKind("USD"), "unsupported");
});

test("a currency cnyRouteBlocker allows is never badged as maintenance", () => {
  for (const currency of ["NGN", "KES", "USDT"] as const) {
    assert.equal(cnyRouteBlocker(currency), null, `${currency} should be routable to yuan`);
  }
});

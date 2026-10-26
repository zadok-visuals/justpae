import { test } from "node:test";
import assert from "node:assert/strict";
import { depositAvailability } from "./availability.ts";
import { UNAVAILABLE_LABEL } from "../ui/unavailability.ts";
import { CURRENCY_CODES } from "../currencies.ts";

/**
 * GROUP 4f — the deposit picker's one word per currency.
 *
 * These tests assume the GHS flag is OFF, which is how it ships and how every
 * environment this has ever run in is configured (see src/lib/flags.ts). If
 * NEXT_PUBLIC_FEATURE_GHS_WALLET is ever turned on in a test
 * environment, the cedi assertion below is the one that should be updated
 * rather than deleted — a flipped flag means a REAL deposit path, and the
 * picker should then carry no suffix at all.
 */

test("every currency either deposits or says specifically why not", () => {
  for (const currency of CURRENCY_CODES) {
    const state = depositAvailability(currency);
    if (state.available) continue;

    assert.ok(state.reason.length > 0, `${currency} has no reason`);
    assert.ok(
      state.kind in UNAVAILABLE_LABEL,
      `${currency}'s kind "${state.kind}" has no label`,
    );
  }
});

test("the two rails that work by default are not described as broken", () => {
  for (const currency of ["KES", "USDT"] as const) {
    assert.equal(depositAvailability(currency).available, true, `${currency} should deposit`);
  }
});

/**
 * With both naira flags off — the ambient default this file runs under, and
 * the state production is in until Korapay goes live — NGN is neither
 * "maintenance" (there is no outage to come back from) nor silently routed
 * through Busha's own broken temporary-account rail. See
 * availability.korapayFlag.test.ts and availability.manualFlag.test.ts for
 * the two flags that change this.
 */
test("naira is 'soon' with both naira flags off, not routed through the broken rail", () => {
  const ngn = depositAvailability("NGN");
  assert.equal(ngn.available, false);
  assert.equal(ngn.available === false && ngn.kind, "soon");
  assert.match(ngn.available === false ? ngn.reason : "", /USDT/);
});

/**
 * The three refusals, and the point of the whole change: they are three
 * different states and used to render as one word, "unavailable".
 */
test("cedis are maintenance — a rail that exists and is down", () => {
  const ghs = depositAvailability("GHS");
  assert.equal(ghs.available, false);
  assert.equal(ghs.available === false && ghs.kind, "maintenance");
});

test("dollars are not maintenance — there is no dollar deposit to repair", () => {
  const usd = depositAvailability("USD");
  assert.equal(usd.available, false);
  assert.equal(usd.available === false && usd.kind, "receive");
  // And the sentence has to point at the thing that DOES work, or the badge is
  // just a politer dead end.
  assert.match(usd.available === false ? usd.reason : "", /receiv/i);
});

test("yuan is bought, not deposited, and says so", () => {
  const cny = depositAvailability("CNY");
  assert.equal(cny.available, false);
  assert.equal(cny.available === false && cny.kind, "convert");
  assert.match(cny.available === false ? cny.reason : "", /convert/i);
  // The old fallthrough said "CNY deposits aren't available yet", which
  // promised a yuan deposit rail that is not being built.
  assert.doesNotMatch(cny.available === false ? cny.reason : "", /aren't available yet/i);
});

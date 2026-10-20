import { test } from "node:test";
import assert from "node:assert/strict";
import { SERVICES, isServiceLive, serviceLabel } from "./services.ts";

/**
 * GROUP 2a. The property that matters: nothing is live unless its env flag
 * was actually set, and this test suite runs with none of them set — so
 * every key here proves "live by default" is impossible, not just untested.
 */

test("every service starts in maintenance with no flags set", () => {
  for (const key of Object.keys(SERVICES) as (keyof typeof SERVICES)[]) {
    assert.equal(SERVICES[key].state, "maintenance", `${key} is live with no flag set`);
    assert.equal(isServiceLive(key), false, `${key} is live with no flag set`);
  }
});

test("the five services Group 2 names are all present", () => {
  for (const key of ["usdWallet", "ghsWallet", "receiveUsd", "bills", "flights"] as const) {
    assert.ok(SERVICES[key], `${key} is missing from SERVICES`);
    assert.ok(serviceLabel(key).length > 0);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TONE_CLASS,
  homeQuickServices,
  serviceCatalogue,
  servicesByCategory,
} from "./serviceCatalogue.ts";

test("Home shows exactly the six the brief names, in that order", () => {
  assert.deepEqual(
    homeQuickServices().map((s) => s.label),
    ["Airtime", "Data", "Electricity", "Cable TV", "Flights", "Education"],
  );
});

test("every service has a tone the stylesheet actually defines", () => {
  for (const service of serviceCatalogue()) {
    assert.ok(TONE_CLASS[service.tone], `${service.key} has no tone class`);
  }
});

test("every service key is unique, so the icon map cannot collide", () => {
  const keys = serviceCatalogue().map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every service lands in a category, and every category has services", () => {
  const grouped = servicesByCategory().flatMap((g) => g.services);
  assert.equal(grouped.length, serviceCatalogue().length);
  for (const group of servicesByCategory()) assert.ok(group.services.length > 0);
});

test("a service under maintenance is still listed — it just is not live", () => {
  // No flags are set in a plain test run, so bills and flights are off.
  const flights = serviceCatalogue().find((s) => s.key === "flights");
  assert.ok(flights);
  assert.equal(flights.live, false);
  // And it is still on Home, where it gets a "Soon" tag rather than vanishing.
  assert.ok(homeQuickServices().some((s) => s.key === "flights"));
});

test("the money services are always live — nothing flags them off", () => {
  const money = serviceCatalogue().filter((s) => s.category === "Money");
  for (const key of ["deposit", "withdraw", "convert", "pay_to_china"]) {
    assert.equal(money.find((s) => s.key === key)?.live, true, key);
  }
});

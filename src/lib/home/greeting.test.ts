import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingFor } from "./greeting.ts";

test("the day is split at noon and at six", () => {
  assert.equal(greetingFor(0), "Good morning,");
  assert.equal(greetingFor(11), "Good morning,");
  assert.equal(greetingFor(12), "Good afternoon,");
  assert.equal(greetingFor(17), "Good afternoon,");
  assert.equal(greetingFor(18), "Good evening,");
  assert.equal(greetingFor(23), "Good evening,");
});

test("every hour of the day gets a greeting with a trailing comma", () => {
  for (let hour = 0; hour < 24; hour += 1) {
    assert.match(greetingFor(hour), /^Good (morning|afternoon|evening),$/);
  }
});

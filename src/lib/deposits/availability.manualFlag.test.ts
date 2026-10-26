import { test } from "node:test";
import assert from "node:assert/strict";

// Same isolation reasoning as availability.korapayFlag.test.ts.
process.env.NEXT_PUBLIC_FEATURE_NGN_MANUAL_DEPOSIT = "true";

const { depositAvailability } = await import("./availability.ts");

test("NGN_MANUAL_DEPOSIT on (with Korapay off) brings the manual rail back for customers", () => {
  const ngn = depositAvailability("NGN");
  assert.equal(ngn.available, true);
  assert.equal(ngn.available === true && ngn.provider, "manual");
});

import { test } from "node:test";
import assert from "node:assert/strict";

// Same isolation reasoning as availability.korapayFlag.test.ts — flags.ts
// reads process.env at module load, so the ON state needs its own process.
process.env.NEXT_PUBLIC_FEATURE_KES_DEPOSIT = "true";

const { depositAvailability } = await import("./availability.ts");

test("KES_DEPOSIT_ENABLED on routes shillings through Busha like before", () => {
  const kes = depositAvailability("KES");
  assert.equal(kes.available, true);
  assert.equal(kes.available === true && kes.provider, "busha");
});

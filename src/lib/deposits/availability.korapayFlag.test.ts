import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Its own file because flags.ts reads process.env at module load — the only
 * way to exercise the ON state is to set the var before this file's own
 * first import, which `node --test` keeps safely isolated to one process
 * per file, not before availability.test.ts's ambient default.
 */
process.env.NEXT_PUBLIC_FEATURE_KORAPAY_NGN_DEPOSIT = "true";

const { depositAvailability } = await import("./availability.ts");

test("KORAPAY_NGN_DEPOSIT on routes naira through Korapay", () => {
  const ngn = depositAvailability("NGN");
  assert.equal(ngn.available, true);
  assert.equal(ngn.available === true && ngn.provider, "korapay");
});

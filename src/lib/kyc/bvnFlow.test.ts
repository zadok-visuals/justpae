import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitFullName,
  dojahMatchInput,
  evaluateDojahMatch,
  bvnConfirmationMatches,
  exceedsBvnAttemptLimit,
  canChangeBvn,
  precheckSaveBvn,
  precheckChangeBvn,
  resolveBvnVerification,
  BVN_CONFIRM_MISMATCH,
  BVN_LOCKED_MESSAGE,
  BVN_TOO_MANY_ATTEMPTS,
} from "./bvnFlow.ts";
import { DojahError } from "../dojah/client.ts";

test("splitFullName takes the first and last word", () => {
  assert.deepEqual(splitFullName("Chidi Musa Okafor"), { firstName: "Chidi", lastName: "Okafor" });
  assert.deepEqual(splitFullName("Chidi"), { firstName: "Chidi", lastName: "Chidi" });
  assert.deepEqual(splitFullName("  Chidi   Okafor  "), { firstName: "Chidi", lastName: "Okafor" });
});

test("dojahMatchInput reads only the two fields the save rule needs", () => {
  assert.deepEqual(
    dojahMatchInput({
      entity: { last_name: { status: true }, first_name: { confidence_value: 92 } },
    }),
    { lastNameMatches: true, firstNameConfidence: 92 },
  );
  assert.deepEqual(dojahMatchInput({}), { lastNameMatches: false, firstNameConfidence: null });
});

test("evaluateDojahMatch requires the last name AND a first-name confidence of at least 80", () => {
  assert.equal(evaluateDojahMatch({ lastNameMatches: true, firstNameConfidence: 80 }), "matched");
  assert.equal(evaluateDojahMatch({ lastNameMatches: true, firstNameConfidence: 100 }), "matched");
  // Dojah mismatch, refused: last name matches but confidence is just under the bar.
  assert.equal(evaluateDojahMatch({ lastNameMatches: true, firstNameConfidence: 79 }), "mismatch");
  // Dojah mismatch, refused: confidence is fine but the last name does not match at all.
  assert.equal(evaluateDojahMatch({ lastNameMatches: false, firstNameConfidence: 100 }), "mismatch");
  assert.equal(evaluateDojahMatch({ lastNameMatches: true, firstNameConfidence: null }), "mismatch");
});

test("bvnConfirmationMatches ignores surrounding whitespace only", () => {
  assert.equal(bvnConfirmationMatches("12345678901", " 12345678901 "), true);
  assert.equal(bvnConfirmationMatches("12345678901", "12345678900"), false);
});

test("exceedsBvnAttemptLimit allows exactly 5, refuses the 6th", () => {
  assert.equal(exceedsBvnAttemptLimit(5), false);
  assert.equal(exceedsBvnAttemptLimit(6), true);
});

test("canChangeBvn follows whether an account has been issued", () => {
  assert.equal(canChangeBvn(false), true);
  assert.equal(canChangeBvn(true), false);
});

test("precheckSaveBvn refuses a confirm-field mismatch", () => {
  const result = precheckSaveBvn({ bvn: "12345678901", confirmBvn: "10987654321", attemptsInWindow: 0 });
  assert.deepEqual(result, { ok: false, error: BVN_CONFIRM_MISMATCH });
});

test("precheckSaveBvn refuses once the attempt limit is exceeded", () => {
  const result = precheckSaveBvn({ bvn: "12345678901", confirmBvn: "12345678901", attemptsInWindow: 6 });
  assert.deepEqual(result, { ok: false, error: BVN_TOO_MANY_ATTEMPTS });
});

test("precheckSaveBvn accepts a matching, well-formed pair under the limit", () => {
  assert.deepEqual(
    precheckSaveBvn({ bvn: "12345678901", confirmBvn: "12345678901", attemptsInWindow: 4 }),
    { ok: true },
  );
});

test("precheckChangeBvn is blocked once a virtual account has been issued, even with the right PIN", () => {
  const result = precheckChangeBvn({
    pin: "123456",
    bvn: "12345678901",
    confirmBvn: "12345678901",
    hasIssuedAccount: true,
    attemptsInWindow: 0,
  });
  assert.deepEqual(result, { ok: false, error: BVN_LOCKED_MESSAGE });
});

test("precheckChangeBvn is allowed before an account is issued", () => {
  const result = precheckChangeBvn({
    pin: "123456",
    bvn: "12345678901",
    confirmBvn: "12345678901",
    hasIssuedAccount: false,
    attemptsInWindow: 0,
  });
  assert.deepEqual(result, { ok: true });
});

test("resolveBvnVerification refuses on a Dojah mismatch, without touching the provider-down flag", async () => {
  const result = await resolveBvnVerification({
    bvn: "12345678901",
    fullName: "Chidi Okafor",
    validate: async () => ({ entity: { last_name: { status: false }, first_name: { confidence_value: 100 } } }),
  });
  assert.deepEqual(result, { outcome: "mismatch", providerDown: false });
});

test("resolveBvnVerification accepts a Dojah match", async () => {
  const result = await resolveBvnVerification({
    bvn: "12345678901",
    fullName: "Chidi Okafor",
    validate: async () => ({ entity: { last_name: { status: true }, first_name: { confidence_value: 95 } } }),
  });
  assert.deepEqual(result, { outcome: "matched", providerDown: false });
});

test("resolveBvnVerification saves as unverified, never blocking, when Dojah is down", async () => {
  const result = await resolveBvnVerification({
    bvn: "12345678901",
    fullName: "Chidi Okafor",
    validate: async () => {
      throw new DojahError("Dojah request did not complete", 0, true);
    },
  });
  assert.deepEqual(result, { outcome: "unverified", providerDown: true });
});

test("resolveBvnVerification also saves as unverified on a 402 (wallet empty)", async () => {
  const result = await resolveBvnVerification({
    bvn: "12345678901",
    fullName: "Chidi Okafor",
    validate: async () => {
      throw new DojahError("Dojah request failed (402)", 402);
    },
  });
  assert.deepEqual(result, { outcome: "unverified", providerDown: true });
});

test("precheckChangeBvn requires a PIN", () => {
  const result = precheckChangeBvn({
    pin: "",
    bvn: "12345678901",
    confirmBvn: "12345678901",
    hasIssuedAccount: false,
    attemptsInWindow: 0,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /PIN/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BVN_DOCUMENT_TYPE,
  LEGACY_NG_ID_DOCUMENT_TYPE,
  NIN_DOCUMENT_TYPE,
  displayKycValue,
  isMaskedDocumentType,
  isValidBvn,
  isValidNin,
  maskBvn,
} from "./bvn.ts";

/**
 * Every number used here is an obviously-fake placeholder. A real BVN must
 * never appear in a fixture, a log or a commit — see the module header.
 */
const FAKE_BVN = "12345678901";

test("a BVN is exactly eleven digits, and nothing else is one", () => {
  assert.equal(isValidBvn(FAKE_BVN), true);
  assert.equal(isValidBvn(`  ${FAKE_BVN}  `), true, "surrounding whitespace is trimmed");

  for (const bad of [
    "1234567890", // ten
    "123456789012", // twelve
    "1234567890a",
    "12345 678901",
    "",
    "            ",
  ]) {
    assert.equal(isValidBvn(bad), false, JSON.stringify(bad));
  }
});

test("a NIN is checked the same way, which is exactly why they are separate fields", () => {
  // Both are 11 digits, so no validator can tell one from the other. That is
  // the whole reason the form asks for them in two labelled boxes and the
  // legacy combined row cannot be read as a BVN.
  assert.equal(isValidNin(FAKE_BVN), true);
  assert.equal(isValidNin("1234567890"), false);
});

test("masking shows four digits and never the rest", () => {
  const masked = maskBvn(FAKE_BVN);
  assert.match(masked, /8901$/);
  assert.doesNotMatch(masked, /1234567/, `leaked the leading digits: "${masked}"`);
  // The first seven digits must not survive anywhere in the output.
  assert.equal(masked.includes(FAKE_BVN.slice(0, 7)), false);
});

test("a malformed or missing value is masked too, not echoed back", () => {
  // A value that failed validation is still somebody's identity number.
  for (const value of [null, undefined, "", "12", "abc"]) {
    const masked = maskBvn(value);
    assert.match(masked, /•/, JSON.stringify(value));
    assert.doesNotMatch(masked, /abc/i);
  }
});

test("the legacy combined row is masked as well, and is not a BVN", () => {
  // It holds either a BVN or a NIN with nothing recording which, so it is
  // masked on the same grounds and does not satisfy the BVN requirement.
  assert.equal(isMaskedDocumentType(LEGACY_NG_ID_DOCUMENT_TYPE), true);
  assert.equal(isMaskedDocumentType(BVN_DOCUMENT_TYPE), true);
  assert.equal(isMaskedDocumentType(NIN_DOCUMENT_TYPE), true);
  assert.notEqual(LEGACY_NG_ID_DOCUMENT_TYPE, BVN_DOCUMENT_TYPE);
});

test("non-identity values are shown in full, because a reviewer reads them", () => {
  assert.equal(isMaskedDocumentType("ghana_card_number"), false);
  assert.equal(displayKycValue("ghana_card_number", "GHA-123456789-1"), "GHA-123456789-1");
  assert.equal(displayKycValue("government_id_type", "passport"), "passport");
  assert.equal(displayKycValue("phone_number", "+2348012345678"), "+2348012345678");
});

test("displayKycValue masks every identity type and handles an empty row", () => {
  for (const type of [BVN_DOCUMENT_TYPE, NIN_DOCUMENT_TYPE, LEGACY_NG_ID_DOCUMENT_TYPE]) {
    const shown = displayKycValue(type, FAKE_BVN);
    assert.doesNotMatch(shown, /1234567/, `${type} leaked: "${shown}"`);
    assert.match(shown, /8901$/, type);
  }
  assert.equal(displayKycValue(BVN_DOCUMENT_TYPE, null), "—");
  assert.equal(displayKycValue(BVN_DOCUMENT_TYPE, ""), "—");
});

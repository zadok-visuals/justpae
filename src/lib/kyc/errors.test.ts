import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KYC_ALREADY_APPROVED,
  KYC_ALREADY_IN_REVIEW,
  KYC_GENERIC_ERROR,
  KYC_PROFILE_INCOMPLETE,
  describeSupabaseError,
  kycUploadMissingMessage,
  toKycError,
} from "./errors.ts";

/**
 * The bug these cover: a PostgrestError is a plain object, so the old
 * `err instanceof Error` check was false for every database failure and the
 * reason never reached the user or the log.
 */

test("a PostgrestError is not an Error, and still produces a usable message", () => {
  const postgrest = {
    code: "42501",
    message: "permission denied for table kyc_documents",
    details: null,
    hint: null,
  };
  assert.equal(postgrest instanceof Error, false);
  assert.equal(toKycError(postgrest), KYC_GENERIC_ERROR);
});

test("the full PostgrestError is kept for the log, never for the user", () => {
  const described = describeSupabaseError({
    code: "42501",
    message: "permission denied for table kyc_documents",
    details: "some detail",
    hint: "some hint",
  });
  assert.deepEqual(described, {
    code: "42501",
    message: "permission denied for table kyc_documents",
    details: "some detail",
    hint: "some hint",
  });
});

test("an upload that is missing or not the user's own names the document", () => {
  const message = kycUploadMissingMessage("A photo of your ID");
  assert.equal(message, "We couldn't find your a photo of your id. Please upload it again.");
  // Thrown as a real Error by requireOwnedUpload, so it passes through intact.
  assert.equal(toKycError(new Error(message)), message);
});

test("an already-approved check is named, not reported as a generic failure", () => {
  assert.equal(
    toKycError({ code: "P0001", message: "Your identity check is already approved." }),
    KYC_ALREADY_APPROVED,
  );
});

test("a duplicate submission reads as already under review", () => {
  assert.equal(
    toKycError({ code: "23505", message: "duplicate key value violates unique constraint" }),
    KYC_ALREADY_IN_REVIEW,
  );
});

test("a document row with neither a file nor a value asks for the upload again", () => {
  const message = toKycError({
    code: "23514",
    message: 'new row violates check constraint "kyc_documents_has_content"',
  });
  assert.match(message, /upload it again/i);
  assert.doesNotMatch(message, /constraint/i);
});

test("a missing profile sends the user back to finish setting up", () => {
  assert.equal(toKycError({ code: "P0001", message: "Profile not found" }), KYC_PROFILE_INCOMPLETE);
  assert.equal(toKycError({ code: "23503", message: "violates foreign key" }), KYC_PROFILE_INCOMPLETE);
});

test("a deliberate RAISE we have no mapping for still reaches the user verbatim", () => {
  assert.equal(
    toKycError({ code: "P0001", message: "Your account type cannot be changed." }),
    "Your account type cannot be changed.",
  );
});

test("an overlong RAISE is replaced rather than dumped on the user", () => {
  assert.equal(toKycError({ code: "P0001", message: "x".repeat(201) }), KYC_GENERIC_ERROR);
});

test("anything unrecognised is generic, and never leaks internals", () => {
  assert.equal(toKycError(null), KYC_GENERIC_ERROR);
  assert.equal(toKycError("boom"), KYC_GENERIC_ERROR);
  assert.equal(
    toKycError({ code: "08006", message: "could not connect to server at 10.0.0.4" }),
    KYC_GENERIC_ERROR,
  );
});

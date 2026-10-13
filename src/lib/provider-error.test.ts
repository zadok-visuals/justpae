import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { toRpcError } from "./provider-error.ts";

/**
 * The line between "copy we wrote for the customer" and "the database
 * describing its own internals".
 *
 * Both failure directions are real and both are bad. Leak everything, and a
 * customer is shown a constraint name at the moment they most need to be told
 * what to do. Sanitise everything, and a user whose PIN is simply wrong gets
 * "something went wrong, try again" and tries the same wrong PIN until the
 * lockout fires.
 */

const GENERIC = "We couldn't complete that right now.";

// toRpcError logs the real error on every call, by design. Silenced here so a
// passing run is not a wall of expected noise.
let originalError: typeof console.error;
beforeEach(() => {
  originalError = console.error;
  console.error = () => {};
});
afterEach(() => {
  console.error = originalError;
});

test("a deliberate RAISE EXCEPTION reaches the customer intact", () => {
  // P0001 is "a PL/pgSQL RAISE that named no other condition" — i.e. one of
  // ours, written to be read by a person.
  assert.equal(
    toRpcError({ code: "P0001", message: "That PIN is wrong." }, "test"),
    "That PIN is wrong.",
  );
  assert.equal(
    toRpcError({ code: "P0001", message: "Your identity check is not approved." }, "test"),
    "Your identity check is not approved.",
  );
});

test("every other SQLSTATE is replaced", () => {
  // Real Postgres errors, with the internals they actually carry.
  const leaks = [
    { code: "23505", message: 'duplicate key value violates unique constraint "wallets_pkey"' },
    { code: "23502", message: 'null value in column "amount" violates not-null constraint' },
    { code: "22P02", message: 'invalid input syntax for type numeric: "abc"' },
    { code: "42883", message: "function create_withdrawal_request(uuid, text) does not exist" },
  ];

  for (const error of leaks) {
    const shown = toRpcError(error, "test");
    assert.ok(shown.startsWith(GENERIC), shown);
    assert.ok(!shown.includes("constraint"), shown);
    assert.ok(!shown.includes("create_withdrawal_request"), shown);
  }
});

test("an error with no code at all is replaced", () => {
  assert.ok(toRpcError({ message: "something exploded" }, "test").startsWith(GENERIC));
  assert.ok(toRpcError(null, "test").startsWith(GENERIC));
  assert.ok(toRpcError(undefined, "test").startsWith(GENERIC));
});

test("a P0001 with no message falls back rather than returning an empty box", () => {
  assert.ok(toRpcError({ code: "P0001", message: "" }, "test").startsWith(GENERIC));
  assert.ok(toRpcError({ code: "P0001" }, "test").startsWith(GENERIC));
  assert.ok(toRpcError({ code: "P0001", message: "   " }, "test").startsWith(GENERIC));
});

test("an over-long P0001 is treated as a developer message, not as copy", () => {
  // A raised assertion or an un-edited internal message can carry this code
  // too, and a wall of SQL in a red box helps nobody.
  const wall = "x".repeat(201);
  assert.ok(toRpcError({ code: "P0001", message: wall }, "test").startsWith(GENERIC));

  // The boundary itself passes through.
  const atLimit = "y".repeat(200);
  assert.equal(toRpcError({ code: "P0001", message: atLimit }, "test"), atLimit);
});

test("a P0001 message is trimmed before it is shown", () => {
  assert.equal(toRpcError({ code: "P0001", message: "  That PIN is wrong.  " }, "test"), "That PIN is wrong.");
});

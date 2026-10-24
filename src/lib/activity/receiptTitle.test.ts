import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptTitle, receiptFilename } from "./receiptTitle.ts";

/**
 * GROUP 7. The bug this guards against: a failed or expired deposit's
 * receipt said "Money added" anyway — an outcome word printed right above a
 * status pill reading "Failed", because the title never looked at status at
 * all. Every other source/type here is a category noun ("Conversion",
 * "Withdrawal", "Airtime"), correct regardless of status, so those are
 * checked once each rather than across every status.
 */

test("a deposit's title follows its own status, not a fixed 'Money added'", () => {
  assert.equal(receiptTitle({ source: "deposit", type: "deposit", status: "completed" }), "Money added");
  assert.equal(receiptTitle({ source: "deposit", type: "deposit", status: "failed" }), "Deposit failed");
  assert.equal(receiptTitle({ source: "deposit", type: "deposit", status: "expired" }), "Deposit expired");
  assert.equal(receiptTitle({ source: "deposit", type: "deposit", status: "pending" }), "Deposit pending");
  assert.equal(receiptTitle({ source: "deposit", type: "deposit", status: "processing" }), "Deposit pending");
});

test("bill titles are the category, independent of status", () => {
  for (const status of ["pending", "completed", "failed"] as const) {
    assert.equal(receiptTitle({ source: "bill", type: "airtime", status }), "Airtime");
    assert.equal(receiptTitle({ source: "bill", type: "electricity", status }), "Electricity");
    assert.equal(receiptTitle({ source: "bill", type: "unknown_category", status }), "Bill payment");
  }
});

test("transaction titles are the category, independent of status", () => {
  for (const status of ["pending", "completed", "failed"] as const) {
    assert.equal(receiptTitle({ source: "transaction", type: "convert", status }), "Conversion");
    assert.equal(receiptTitle({ source: "transaction", type: "withdrawal", status }), "Withdrawal");
    assert.equal(receiptTitle({ source: "transaction", type: "pay_to_china", status }), "Pay to China");
    assert.equal(receiptTitle({ source: "transaction", type: "something_else", status }), "Transaction");
  }
});

test("receiptFilename falls back to the row id when there's no provider reference", () => {
  assert.equal(receiptFilename("TRF_abc123", "fallback-id"), "justpae-receipt-TRF_abc123.png");
  assert.equal(receiptFilename(null, "fallback-id"), "justpae-receipt-fallback-id.png");
});

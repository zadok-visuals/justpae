import { test } from "node:test";
import assert from "node:assert/strict";
import { activityAmount, isUnsettled } from "./activityAmount.ts";

test("a completed credit is the only thing that gets a green plus", () => {
  assert.deepEqual(activityAmount("NGN", 5000, "in", "completed"), {
    text: "+NGN 5,000.00",
    tone: "credit",
  });
});

for (const status of ["failed", "expired", "cancelled"]) {
  test(`a ${status} credit shows no plus and no green`, () => {
    const shown = activityAmount("NGN", 5000, "in", status);
    assert.equal(shown.text, "NGN 5,000.00");
    assert.equal(shown.tone, "neutral");
    assert.ok(!shown.text.startsWith("+"));
  });

  test(`a ${status} debit shows no minus either — nothing left the wallet`, () => {
    const shown = activityAmount("NGN", 5000, "out", status);
    assert.equal(shown.text, "NGN 5,000.00");
    assert.equal(shown.tone, "neutral");
  });
}

test("a credit still in flight is neutral — the pill says when it lands", () => {
  for (const status of ["pending", "processing", "awaiting_review", "partially_completed"]) {
    const shown = activityAmount("KES", 1200, "in", status);
    assert.equal(shown.text, "KES 1,200.00", status);
    assert.equal(shown.tone, "neutral", status);
  }
});

test("a refund is not a completed credit, so it is not green", () => {
  assert.deepEqual(activityAmount("NGN", 100, "in", "refunded"), {
    text: "NGN 100.00",
    tone: "neutral",
  });
});

test("money on its way out keeps its minus", () => {
  assert.deepEqual(activityAmount("USDT", 10, "out", "processing"), {
    text: "−USDT 10.00",
    tone: "neutral",
  });
});

test("isUnsettled names exactly the three statuses where nothing moved", () => {
  for (const status of ["failed", "expired", "cancelled"]) assert.ok(isUnsettled(status), status);
  for (const status of ["pending", "processing", "completed", "refunded", "awaiting_review"]) {
    assert.ok(!isUnsettled(status), status);
  }
});

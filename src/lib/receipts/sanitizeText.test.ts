import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeReceiptText } from "./sanitizeText.ts";

test("strips control and bidi-override characters from a hostile recipient name", () => {
  const hostile = "John‮evil <svg onload=alert(1)>​doe";
  const result = sanitizeReceiptText(hostile);
  assert.equal(result, "Johnevil <svg onload=alert(1)>doe");
  assert.ok(!/[‮​]/.test(result));
});

test("caps length so a receipt row cannot grow the canvas unbounded", () => {
  const long = "a".repeat(500);
  assert.equal(sanitizeReceiptText(long, 120).length, 120);
});

test("leaves ordinary text untouched", () => {
  assert.equal(sanitizeReceiptText("Jane Doe — GTBank"), "Jane Doe — GTBank");
});

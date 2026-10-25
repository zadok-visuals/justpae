import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECIPIENT_CHANGE_HOLD_HOURS,
  decideWithdrawalRouting,
  pinFormatError,
  recipientChangeHoldActive,
  recipientFieldError,
  usdWithdrawalError,
  withdrawalFee,
} from "./rules.ts";

// ── The fee ────────────────────────────────────────────────────────────────

test("the withdrawal fee rounds to the minor unit", () => {
  // 1% of 1,234.56 is 12.3456, which must not reach a customer or a ledger
  // with four decimal places on it.
  assert.equal(withdrawalFee(1234.56, 0.01), 12.35);
  assert.equal(withdrawalFee(100, 0.01), 1);
  assert.equal(withdrawalFee(0, 0.01), 0);
});

test("a zero fee rate charges nothing", () => {
  assert.equal(withdrawalFee(50_000, 0), 0);
});

test("the fee never exceeds the amount for a sane rate", () => {
  const amount = 10_000;
  assert.ok(withdrawalFee(amount, 0.01) < amount);
});

// ── The routing rule: size, recipient hold, corridor ───────────────────────

const BASE = { currency: "NGN", thresholdUsd: 1000, hasPayoutChannel: true };

test("below the threshold pays out automatically", () => {
  const result = decideWithdrawalRouting({ ...BASE, requestUsd: 50 });
  assert.equal(result.automated, true);
  assert.equal(result.reason, null);
});

test("above the threshold needs a review, and says why in USDT", () => {
  const result = decideWithdrawalRouting({ ...BASE, requestUsd: 1000.01 });
  assert.equal(result.automated, false);
  assert.equal(result.reason, "Needs a quick review because it's above 1,000 USDT");
});

test("exactly at the threshold is still automatic", () => {
  // The check is `>`, not `>=`. A limit of 1000 that refuses 1000 is a limit of
  // 999.99 described wrongly to the customer.
  assert.equal(decideWithdrawalRouting({ ...BASE, requestUsd: 1000 }).automated, true);
});

test("the reason names the configured threshold, not a hardcoded 1000", () => {
  const result = decideWithdrawalRouting({ ...BASE, thresholdUsd: 2500, requestUsd: 3000 });
  assert.match(result.reason ?? "", /above 2,500 USDT/);
});

test("NO ROLLING TOTAL: several small withdrawals in one day are each automatic", () => {
  // Deliberate, and the one behaviour this group changed. Each request is
  // judged on its own size; a day of small withdrawals is not summed.
  for (let i = 0; i < 10; i++) {
    const result = decideWithdrawalRouting({ ...BASE, requestUsd: 150 });
    assert.equal(result.automated, true, `withdrawal ${i + 1}`);
  }
});

test("a currency with no payout channel is always reviewed, however small", () => {
  const result = decideWithdrawalRouting({
    ...BASE,
    currency: "GHS",
    hasPayoutChannel: false,
    requestUsd: 1,
  });

  assert.equal(result.automated, false);
  assert.match(result.reason ?? "", /GHS/);
});

test("the unsupported-corridor check comes before the amount check", () => {
  // Order matters: an unsupported corridor must be reported as such rather
  // than as "above the limit", which would be a wrong explanation.
  const result = decideWithdrawalRouting({
    ...BASE,
    currency: "GHS",
    hasPayoutChannel: false,
    requestUsd: 99_999,
  });
  assert.match(result.reason ?? "", /GHS payouts aren't automated/);
});

// ── The recipient-change hold ──────────────────────────────────────────────

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-03-01T12:00:00Z");

test("a recipient changed within the hold keeps the withdrawal manual", () => {
  assert.equal(recipientChangeHoldActive(new Date(NOW - HOUR).toISOString(), NOW), true);
  assert.equal(recipientChangeHoldActive(new Date(NOW - 23 * HOUR).toISOString(), NOW), true);
});

test("the hold expires after RECIPIENT_CHANGE_HOLD_HOURS, and is off by default", () => {
  const expired = new Date(NOW - (RECIPIENT_CHANGE_HOLD_HOURS + 1) * HOUR).toISOString();
  assert.equal(recipientChangeHoldActive(expired, NOW), false);
  // Never changed, and a garbage timestamp, both mean no hold — the hold is
  // an extra gate, not the thing that decides a payout is allowed at all.
  assert.equal(recipientChangeHoldActive(null, NOW), false);
  assert.equal(recipientChangeHoldActive("not a date", NOW), false);
});

// ── PIN lockout and PIN acceptability ──────────────────────────────────────

test("a PIN must be exactly six digits", () => {
  assert.equal(pinFormatError("846207"), null);
  assert.match(pinFormatError("8462") ?? "", /exactly 6 digits/);
  assert.match(pinFormatError("8462078") ?? "", /exactly 6 digits/);
  assert.match(pinFormatError("84620a") ?? "", /exactly 6 digits/);
  assert.match(pinFormatError("") ?? "", /exactly 6 digits/);
});

test("trivial PINs are refused, because a lockout cannot save a guessable one", () => {
  // The lockout in migration 0012 allows a handful of attempts. That protects
  // nothing if the first few guesses anyone would make are the actual PIN.
  for (const pin of ["000000", "111111", "999999"]) {
    assert.match(pinFormatError(pin) ?? "", /same digit/, pin);
  }
  for (const pin of ["123456", "234567", "987654", "543210"]) {
    assert.match(pinFormatError(pin) ?? "", /sequential/, pin);
  }
  for (const pin of ["010101", "121212", "123123", "456456"]) {
    assert.match(pinFormatError(pin) ?? "", /repeating patterns/, pin);
  }
});

test("a PIN that merely looks patterned is still allowed", () => {
  // The rules must not be so eager that they reject most real PINs.
  for (const pin of ["194827", "730415", "628193", "100200"]) {
    assert.equal(pinFormatError(pin), null, pin);
  }
});

// ── Payout destinations ────────────────────────────────────────────────────

test("a Nigerian account number is exactly ten digits", () => {
  assert.equal(recipientFieldError("NGN", { bankAccountNumber: "0123456789" }), null);
  assert.match(recipientFieldError("NGN", { bankAccountNumber: "012345678" }) ?? "", /10 digits/);
  assert.match(recipientFieldError("NGN", { bankAccountNumber: "01234567890" }) ?? "", /10 digits/);
  assert.match(recipientFieldError("NGN", { bankAccountNumber: "" }) ?? "", /10 digits/);
});

test("a USDT destination is a BSC address", () => {
  const good = "0x" + "a".repeat(40);
  assert.equal(recipientFieldError("USDT", { walletAddress: good }), null);
  // Mixed case is a checksummed address and perfectly valid.
  assert.equal(recipientFieldError("USDT", { walletAddress: "0x" + "aF3b9C".repeat(6) + "dEf4" }), null);
  assert.match(recipientFieldError("USDT", { walletAddress: "0xabc" }) ?? "", /0x/);
  assert.match(recipientFieldError("USDT", { walletAddress: "a".repeat(42) }) ?? "", /0x/);
});

test("M-Pesa numbers are accepted in both the forms people actually use", () => {
  for (const number of ["0712345678", "+254712345678", "254712345678", "712345678"]) {
    assert.equal(recipientFieldError("KES", { bankAccountNumber: number }), null, number);
  }
  assert.match(recipientFieldError("KES", { bankAccountNumber: "0712" }) ?? "", /M-Pesa/);
});

test("Ghanaian account numbers are not length-checked, because they vary by bank", () => {
  // Deliberately permissive. Inventing a length here would reject valid
  // accounts, which is worse than letting the provider catch a typo.
  assert.equal(recipientFieldError("GHS", { bankAccountNumber: "1234567890123" }), null);
  assert.equal(recipientFieldError("GHS", { bankAccountNumber: "012345678" }), null);
});

test("the recipient-change hold is a whole day", () => {
  assert.equal(RECIPIENT_CHANGE_HOLD_HOURS, 24);
});

test("USD is refused on the server, not only in the picker", () => {
  assert.match(usdWithdrawalError("USD") ?? "", /convert/i);
  for (const currency of ["NGN", "KES", "USDT", "GHS", "CNY"]) {
    assert.equal(usdWithdrawalError(currency), null, currency);
  }
});

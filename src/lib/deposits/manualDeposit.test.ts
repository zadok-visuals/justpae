import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEPOSIT_REFERENCE_PATTERN,
  MANUAL_DEPOSIT_DEFAULTS,
  isManualDepositConfigured,
  isValidDepositReference,
  previewCredit,
  validateManualDepositAmount,
  type ManualDepositConfig,
} from "./manualDeposit.ts";
import { depositAvailability } from "./availability.ts";

/**
 * GROUP 4 — manual NGN bank-transfer deposits, the half that can be tested
 * without a database.
 *
 * THE OTHER HALF IS NOT HERE AND IS NOT MISSING. Everything that decides
 * whether money moves — a customer cannot approve or credit, a double approve
 * credits once, the received amount is used rather than the requested one,
 * the second-admin rule, the expiry, the RLS on deposits and on the
 * screenshot bucket — is enforced inside migration 0037 and asserted there,
 * against the live database, in a rolled-back transaction. Re-implementing
 * those assertions over a mock would test the mock. See section 9 and 10 of
 * supabase/migrations/0037_manual_bank_transfer_deposits.sql.
 */

const CONFIG: ManualDepositConfig = {
  bankName: "Test Bank",
  accountNumber: "0123456789",
  accountName: "Zadok Royal Limited",
  minAmount: 1000,
  maxAmount: 5_000_000,
  fee: 0,
};

const ngn = (value: number) => `NGN ${value}`;

// ── The reference ──────────────────────────────────────────────────────────

test("the reference format matches what generate_deposit_reference produces", () => {
  assert.ok(isValidDepositReference("JPA7K2M9Q4"));
  assert.equal(DEPOSIT_REFERENCE_PATTERN.source.includes("JP"), true);
});

test("the reference alphabet excludes the characters people mistype", () => {
  // I, O, 0 and 1 are left out on purpose: this string is read off a screen
  // and typed into a bank app by hand, and a confusable character makes a
  // real transfer unmatchable.
  for (const bad of ["JPIIIIIIII", "JPOOOOOOOO", "JP00000000", "JP11111111"]) {
    assert.equal(isValidDepositReference(bad), false, `${bad} should be rejected`);
  }
});

test("a reference of the wrong length or prefix is rejected", () => {
  for (const bad of ["JPA7K2M9", "JPA7K2M9Q44", "XXA7K2M9Q4", "", null, undefined]) {
    assert.equal(isValidDepositReference(bad as string), false);
  }
});

// ── Configuration ──────────────────────────────────────────────────────────

test("instructions are withheld until all three account fields are set", () => {
  assert.equal(isManualDepositConfigured(CONFIG), true);

  // 0037 seeds the bank name and number EMPTY rather than with a placeholder.
  // A plausible-looking fake in a field telling people where to send money is
  // the one default worse than none, so the screen has to refuse to render.
  assert.equal(isManualDepositConfigured({ ...CONFIG, bankName: "" }), false);
  assert.equal(isManualDepositConfigured({ ...CONFIG, accountNumber: "  " }), false);
  assert.equal(isManualDepositConfigured({ ...CONFIG, accountName: "" }), false);
});

test("the defaults match what migration 0037 seeds", () => {
  assert.equal(MANUAL_DEPOSIT_DEFAULTS.minAmount, 1000);
  assert.equal(MANUAL_DEPOSIT_DEFAULTS.maxAmount, 5_000_000);
  assert.equal(MANUAL_DEPOSIT_DEFAULTS.fee, 0);
});

// ── The amount, which is the one customer-supplied figure ──────────────────

test("an acceptable amount produces no message", () => {
  assert.equal(validateManualDepositAmount(50_000, CONFIG, ngn), null);
  // The bounds are inclusive, matching create_manual_deposit's own `<` / `>`.
  assert.equal(validateManualDepositAmount(CONFIG.minAmount, CONFIG, ngn), null);
  assert.equal(validateManualDepositAmount(CONFIG.maxAmount, CONFIG, ngn), null);
});

test("the limits are enforced client-side too, so the customer gets a sentence", () => {
  assert.match(validateManualDepositAmount(999, CONFIG, ngn) ?? "", /smallest/i);
  assert.match(validateManualDepositAmount(5_000_001, CONFIG, ngn) ?? "", /largest/i);
});

test("a non-amount is refused rather than sent to the database", () => {
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.match(validateManualDepositAmount(bad, CONFIG, ngn) ?? "", /valid amount/i);
  }
});

// ── The fee preview ────────────────────────────────────────────────────────

test("the preview shows the flat fee coming off before the wallet", () => {
  assert.equal(previewCredit(50_000, 100), 49_900);
  assert.equal(previewCredit(50_000, 0), 50_000);
});

test("the preview never shows a negative credit", () => {
  // approve_manual_deposit refuses this outright. The preview must not show a
  // minus figure on the way to that refusal.
  assert.equal(previewCredit(50, 100), 0);
  assert.equal(previewCredit(1000, -5), 1000);
});

// ── The rail swap ──────────────────────────────────────────────────────────

test("naira is 'soon' for customers with both naira flags at their default off", () => {
  // NGN_MANUAL_DEPOSIT now defaults to OFF, same as every other flag in this
  // file — the manual rail stays built but hidden from customers unless it
  // is explicitly turned back on. See availability.manualFlag.test.ts for
  // the ON state, which needs its own process: flags.ts reads process.env
  // once, at import time.
  const ngnState = depositAvailability("NGN");
  assert.equal(ngnState.available, false);
  assert.equal(ngnState.available === false && ngnState.kind, "soon");
});

test("the manual rail is naira only — it does not leak onto the other currencies", () => {
  for (const currency of ["KES", "USDT"] as const) {
    const state = depositAvailability(currency);
    assert.equal(state.available, true);
    assert.equal(state.available === true && state.provider, "busha");
  }
});

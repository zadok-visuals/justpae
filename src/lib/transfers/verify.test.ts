import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTransferMatchesRow, undoMarkup } from "./verify.ts";
import type { BushaTransfer } from "@/lib/busha/client";

/**
 * The verifier's job is to answer ONE question — "is this the transfer this
 * row was created for?" — and it has two ways to get that wrong, which cost
 * very different amounts:
 *
 *   a false MATCH   settles a row against somebody else's completed transfer.
 *                   That is the attack migration 0010 closed.
 *   a false MISMATCH flags a correct conversion for manual review and leaves
 *                   the user's money in limbo until a human looks.
 *
 * Before 0024's two-leg execution the second one was guaranteed: every
 * fiat-to-fiat row would be flagged, every time, because the row's
 * provider_reference is leg 2's and leg 2's source is USDT rather than the
 * naira the row records. Most of what is below is about that.
 */

type Row = Parameters<typeof verifyTransferMatchesRow>[0];

function transfer(overrides: Partial<BushaTransfer> = {}): BushaTransfer {
  return {
    id: "tr_single",
    quote_id: "q_1",
    reference: "ref_1",
    category: "conversion",
    source_currency: "NGN",
    target_currency: "USDT",
    source_amount: "50000.00",
    target_amount: "36.20",
    pay_in: { type: "none" },
    status: "funds_converted",
    ...overrides,
  };
}

/** A plain fiat <-> USDT conversion: one leg, no bridge. */
function singleLegRow(overrides: Partial<Row> = {}): Row {
  return {
    type: "convert",
    amount: 50000,
    currency: "NGN",
    target_currency: "USDT",
    target_amount: 36.02,
    raw_target_amount: 36.2,
    markup_rate: 0.005,
    bridge_currency: null,
    leg1_provider_reference: null,
    leg2_provider_reference: null,
    leg1_target_amount: null,
    ...overrides,
  };
}

/**
 * NGN 50,000 -> KES, bridged through USDT.
 *   leg 1  NGN 50000  -> USDT 36.20 raw, stored as 36.02 after a 0.5% markup
 *   leg 2  USDT 36.20 -> KES 4700 raw, stored as 4676.50 to the customer
 */
function bridgedRow(overrides: Partial<Row> = {}): Row {
  return {
    type: "convert",
    amount: 50000,
    currency: "NGN",
    target_currency: "KES",
    target_amount: 4676.5,
    raw_target_amount: 4700,
    markup_rate: 0.005,
    bridge_currency: "USDT",
    leg1_provider_reference: "tr_leg1",
    leg2_provider_reference: "tr_leg2",
    leg1_target_amount: 36.02,
    ...overrides,
  };
}

const leg1Transfer = transfer({
  id: "tr_leg1",
  source_currency: "NGN",
  target_currency: "USDT",
  source_amount: "50000.00",
  target_amount: "36.20",
});

const leg2Transfer = transfer({
  id: "tr_leg2",
  source_currency: "USDT",
  target_currency: "KES",
  source_amount: "36.20",
  target_amount: "4700.00",
});

// ── Single leg: the behaviour that already existed must not change ─────────

test("a single-leg conversion still matches its own transfer", () => {
  assert.equal(verifyTransferMatchesRow(singleLegRow(), transfer()).matches, true);
});

test("a single-leg conversion rejects a transfer for a different amount", () => {
  const result = verifyTransferMatchesRow(
    singleLegRow(),
    transfer({ source_amount: "9000000.00" }),
  );
  assert.equal(result.matches, false);
  assert.match(result.reason ?? "", /source amount/);
});

test("a single-leg conversion rejects a transfer for a different currency", () => {
  const result = verifyTransferMatchesRow(singleLegRow(), transfer({ source_currency: "KES" }));
  assert.equal(result.matches, false);
  assert.match(result.reason ?? "", /source currency/);
});

test("the target is compared against the PROVIDER's delivery, not the customer figure", () => {
  // raw_target_amount is what the provider handed over; target_amount is that
  // minus our markup. Comparing against the latter would flag every single
  // correctly-priced conversion.
  assert.equal(
    verifyTransferMatchesRow(singleLegRow(), transfer({ target_amount: "36.20" })).matches,
    true,
  );
  assert.equal(
    verifyTransferMatchesRow(singleLegRow(), transfer({ target_amount: "36.02" })).matches,
    false,
  );
});

// ── Two legs: the regression this file mainly exists for ───────────────────

test("THE ONE THAT MATTERS: leg 2 of a bridged conversion matches its row", () => {
  // Leg 2 reports USDT -> KES. The row reports NGN -> KES. Under the
  // pre-0024 rules both the source currency and the source amount disagreed,
  // so every fiat-to-fiat conversion was flagged for manual review rather
  // than completed — a correct conversion stranded on every single order.
  const result = verifyTransferMatchesRow(bridgedRow(), leg2Transfer);
  assert.equal(result.matches, true, result.reason);
});

test("leg 1 of a bridged conversion also matches, for a webhook that names it", () => {
  const result = verifyTransferMatchesRow(bridgedRow(), leg1Transfer);
  assert.equal(result.matches, true, result.reason);
});

test("a transfer that is neither leg is rejected by name", () => {
  const result = verifyTransferMatchesRow(bridgedRow(), transfer({ id: "tr_someone_else" }));
  assert.equal(result.matches, false);
  assert.match(result.reason ?? "", /neither leg/);
});

test("leg 2 with the wrong bridge currency is rejected", () => {
  // Still the real check: being named leg 2 is not enough if the transfer
  // does not describe the leg the row says leg 2 was.
  const result = verifyTransferMatchesRow(
    bridgedRow(),
    transfer({ id: "tr_leg2", source_currency: "GHS", target_currency: "KES" }),
  );
  assert.equal(result.matches, false);
  assert.match(result.reason ?? "", /source currency/);
});

test("leg 2 for a wildly different bridge amount is rejected", () => {
  const result = verifyTransferMatchesRow(
    bridgedRow(),
    transfer({
      id: "tr_leg2",
      source_currency: "USDT",
      target_currency: "KES",
      source_amount: "5000.00",
      target_amount: "4700.00",
    }),
  );
  assert.equal(result.matches, false);
  assert.match(result.reason ?? "", /source amount/);
});

test("leg 2 still matches when the bridge amount is off by rounding", () => {
  // The expected bridge figure is recovered by undoing a markup on an
  // already-rounded number, so it cannot be exact. A few minor units must not
  // read as a different transfer.
  const result = verifyTransferMatchesRow(
    bridgedRow(),
    transfer({
      id: "tr_leg2",
      source_currency: "USDT",
      target_currency: "KES",
      source_amount: "36.22",
      target_amount: "4700.00",
    }),
  );
  assert.equal(result.matches, true, result.reason);
});

test("an unrecoverable markup skips the bridge amount check rather than failing it", () => {
  // No markup recorded means the raw leg-1 figure cannot be derived. An
  // unverifiable amount must not become a false mismatch — the currencies and
  // the final delivery still tie the transfer to the row.
  const result = verifyTransferMatchesRow(bridgedRow({ markup_rate: null }), leg2Transfer);
  assert.equal(result.matches, true, result.reason);
});

// ── Withdrawals keep their looser target rule ──────────────────────────────

test("a withdrawal is matched on its source side only", () => {
  const row = singleLegRow({ type: "withdrawal", target_currency: null, raw_target_amount: null });
  const result = verifyTransferMatchesRow(
    row,
    transfer({ category: "withdrawal", target_amount: "0.00" }),
  );
  assert.equal(result.matches, true, result.reason);
});

// ── The arithmetic ─────────────────────────────────────────────────────────

test("undoMarkup inverts applyMarkupToAmount", () => {
  // 36.20 * (1 - 0.005) = 36.019
  assert.ok(Math.abs(undoMarkup(36.019, 0.005)! - 36.2) < 1e-9);
});

test("undoMarkup refuses anything it cannot invert safely", () => {
  assert.equal(undoMarkup(null, 0.005), null);
  assert.equal(undoMarkup(36.02, null), null);
  // A markup of 1 would be a divide by zero; a negative one is nonsense.
  assert.equal(undoMarkup(36.02, 1), null);
  assert.equal(undoMarkup(36.02, -0.1), null);
});

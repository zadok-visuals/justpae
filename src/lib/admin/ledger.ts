/**
 * Reading migration 0027's `admin_activity_ledger`.
 *
 * No imports, so the label mapping is testable without a database.
 */

/**
 * The kinds an operator can filter by, in the order the filter offers them.
 *
 * `kind` in the view is three different things flattened into one column: a
 * transaction_type verbatim, the literal 'deposit', and 'bill_' + a
 * bill_category. That is deliberate — the operator's question is "what
 * happened", not "which table was it in" — but it means the list of possible
 * values is not any one Postgres enum, so it is written out here and
 * asserted against by `isLedgerKind`.
 */
export const LEDGER_KINDS = [
  "deposit",
  "convert",
  "withdrawal",
  "pay_to_china",
  "bill_airtime",
  "bill_data",
  "bill_electricity",
  "bill_water",
  "bill_cable_tv",
] as const;

export type LedgerKind = (typeof LEDGER_KINDS)[number];

export function isLedgerKind(value: string): value is LedgerKind {
  return (LEDGER_KINDS as readonly string[]).includes(value);
}

const KIND_LABELS: Record<LedgerKind, string> = {
  deposit: "Deposit",
  convert: "Conversion",
  withdrawal: "Withdrawal",
  pay_to_china: "Pay to China",
  bill_airtime: "Airtime",
  bill_data: "Data",
  bill_electricity: "Electricity",
  bill_water: "Water",
  bill_cable_tv: "Cable TV",
};

/**
 * A kind, in words.
 *
 * Falls back to de-snaking an unrecognised value rather than rendering it
 * raw: a currency or a bill category added to the database before this list
 * is updated should read as "Some Thing", not as "some_thing". The page
 * stays correct while being slightly less polished, which is the right way
 * round for an admin screen.
 */
export function ledgerKindLabel(kind: string): string {
  if (isLedgerKind(kind)) return KIND_LABELS[kind];
  return kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The statuses worth filtering by.
 *
 * `refunded` only ever appears on a bill row and `partially_completed` only
 * on a two-leg conversion, but both are offered unconditionally: an operator
 * filtering to a status with no rows gets an empty list, which is an answer.
 */
export const LEDGER_STATUSES = [
  "pending",
  "processing",
  "completed",
  "partially_completed",
  "failed",
  "refunded",
] as const;

export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export function isLedgerStatus(value: string): value is LedgerStatus {
  return (LEDGER_STATUSES as readonly string[]).includes(value);
}

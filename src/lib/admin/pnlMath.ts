import { usdtRateAt, toUsdt, type SupplierRateRow } from "@/lib/admin/supplierRate";

/**
 * The margin arithmetic, with no database in it.
 *
 * EVERYTHING IS IN USDT, and that is not a presentation choice. This business
 * earns in four different currencies across four different routes, and a
 * "total margin" that adds naira to yuan is a number that looks authoritative
 * and means nothing. USDT is the one unit all four can be compared in, and
 * the supplier rate in force at the time is what converts them (see
 * supplierRate.ts).
 *
 * The four routes, and why each is computed the way it is:
 *
 *   provider conversion   The margin is already recorded on the row:
 *                         raw_target_amount is what the provider delivered,
 *                         target_amount is what the customer was credited.
 *                         The gap IS the margin, in the target currency, and
 *                         only needs converting.
 *
 *   yuan conversion       No provider delivered anything — the business is
 *                         the counterparty. So the margin is revenue minus
 *                         what the yuan actually cost us at the supplier
 *                         rate, which is a different calculation from the
 *                         markup gap and will not agree with it.
 *
 *   pay to China          A yuan conversion followed immediately by a spend,
 *                         recorded as one row. Same revenue-minus-cost shape.
 *                         A request funded FROM a CNY balance is deliberately
 *                         not counted: that margin was realised when the CNY
 *                         was bought, and counting it again doubles it.
 *
 *   withdrawal fee        Straightforwardly the fee, converted.
 *
 * Pure, and therefore testable: this is where a sign error or a double count
 * would hide, and neither is visible by reading the page that renders it.
 */

export type PnlRoute =
  | "conversion"
  | "cny_conversion"
  | "pay_to_china"
  | "withdrawal_fee";

export interface PnlInputRow {
  id: string;
  createdAt: string;
  type: "convert" | "withdrawal" | "pay_to_china";
  provider: string;
  currency: string;
  amount: number;
  targetCurrency: string | null;
  targetAmount: number | null;
  actualTargetAmount: number | null;
  rawTargetAmount: number | null;
}

export interface PnlOrder {
  id: string;
  createdAt: string;
  route: PnlRoute;
  routeLabel: string;
  paidLabel: string;
  gotLabel: string;
  /** Null when the order could not be valued — never silently zero. */
  pnlUsdt: number | null;
  /** Why it could not be valued, for the operator rather than the customer. */
  skippedReason: string | null;
  /** True when a fallback supplier rate was used. See usdtRateAt. */
  estimated: boolean;
}

export interface PnlTotals {
  conversionUsdt: number;
  cnyConversionUsdt: number;
  payToChinaUsdt: number;
  withdrawalFeesUsdt: number;
  totalUsdt: number;
  skipped: number;
  estimated: number;
  /**
   * Pay to China requests funded from a CNY balance. Counted nowhere, on
   * purpose — surfaced so the operator can see that the omission is
   * deliberate rather than a gap.
   */
  cnyFundedPayments: number;
}

const ROUTE_LABELS: Record<PnlRoute, string> = {
  conversion: "Conversions",
  cny_conversion: "Yuan conversions",
  pay_to_china: "Pay to China",
  withdrawal_fee: "Withdrawal fees",
};

function money(amount: number, currency: string): string {
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
}

export function computePnl(
  rows: PnlInputRow[],
  rates: SupplierRateRow[],
): { orders: PnlOrder[]; totals: PnlTotals } {
  const orders: PnlOrder[] = [];
  const totals: PnlTotals = {
    conversionUsdt: 0,
    cnyConversionUsdt: 0,
    payToChinaUsdt: 0,
    withdrawalFeesUsdt: 0,
    totalUsdt: 0,
    skipped: 0,
    estimated: 0,
    cnyFundedPayments: 0,
  };

  for (const row of rows) {
    const order = valueOrder(row, rates);
    if (!order) continue;

    orders.push(order);

    if (order.pnlUsdt == null) {
      totals.skipped += 1;
      continue;
    }
    if (order.estimated) totals.estimated += 1;

    switch (order.route) {
      case "conversion":
        totals.conversionUsdt += order.pnlUsdt;
        break;
      case "cny_conversion":
        totals.cnyConversionUsdt += order.pnlUsdt;
        break;
      case "pay_to_china":
        totals.payToChinaUsdt += order.pnlUsdt;
        break;
      case "withdrawal_fee":
        totals.withdrawalFeesUsdt += order.pnlUsdt;
        break;
    }
  }

  totals.cnyFundedPayments = rows.filter(
    (r) => r.type === "pay_to_china" && r.currency === "CNY",
  ).length;

  totals.totalUsdt =
    totals.conversionUsdt +
    totals.cnyConversionUsdt +
    totals.payToChinaUsdt +
    totals.withdrawalFeesUsdt;

  orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { orders, totals };
}

/** Null means "this row contributes nothing and is not an omission". */
function valueOrder(row: PnlInputRow, rates: SupplierRateRow[]): PnlOrder | null {
  if (row.type === "withdrawal") return valueWithdrawal(row, rates);
  if (row.type === "pay_to_china") return valuePayToChina(row, rates);
  if (row.targetCurrency == null) return null;

  const isCny = row.currency === "CNY" || row.targetCurrency === "CNY";
  return isCny ? valueCnyConversion(row, rates) : valueProviderConversion(row, rates);
}

function base(row: PnlInputRow, route: PnlRoute) {
  return {
    id: row.id,
    createdAt: row.createdAt,
    route,
    routeLabel: ROUTE_LABELS[route],
  };
}

/**
 * A provider conversion: the margin is already on the row.
 *
 * raw_target_amount is the provider's own delivered figure and target_amount
 * is what the customer was credited; the gap is what the business kept.
 * Nothing here recomputes it from a rate — a rate reconstruction loses every
 * rounding step the real order went through.
 */
function valueProviderConversion(row: PnlInputRow, rates: SupplierRateRow[]): PnlOrder {
  const common = base(row, "conversion");
  const paidLabel = money(row.amount, row.currency);
  const gotLabel = money(row.targetAmount ?? 0, row.targetCurrency ?? "—");

  if (row.rawTargetAmount == null || row.targetAmount == null || row.targetCurrency == null) {
    return {
      ...common,
      paidLabel,
      gotLabel,
      pnlUsdt: null,
      skippedReason: "No rate trail recorded on this order.",
      estimated: false,
    };
  }

  const marginLocal = row.rawTargetAmount - row.targetAmount;
  const converted = toUsdt(marginLocal, row.targetCurrency, rates, row.createdAt);
  if (!converted) {
    return {
      ...common,
      paidLabel,
      gotLabel,
      pnlUsdt: null,
      skippedReason: `No supplier rate on file for USDT/${row.targetCurrency}.`,
      estimated: false,
    };
  }

  return {
    ...common,
    paidLabel,
    gotLabel,
    pnlUsdt: converted.usdt,
    skippedReason: null,
    estimated: converted.estimated,
  };
}

/**
 * A yuan conversion: revenue minus what the yuan cost us.
 *
 * NOT the markup gap, and the distinction is the whole reason this branch
 * exists. On a provider conversion the markup IS the margin, because the
 * provider was paid its own rate. Here the business is the counterparty: it
 * sells yuan at a laddered rate and buys them at a supplier rate, and the
 * real margin is the gap between those two — which the markup figure does not
 * capture and can disagree with in either direction.
 */
function valueCnyConversion(row: PnlInputRow, rates: SupplierRateRow[]): PnlOrder {
  const common = base(row, "cny_conversion");
  const paidLabel = money(row.amount, row.currency);
  const gotLabel = money(row.targetAmount ?? 0, row.targetCurrency ?? "—");
  const fromCny = row.currency === "CNY";

  if (row.targetAmount == null || row.targetCurrency == null) {
    return {
      ...common,
      paidLabel,
      gotLabel,
      pnlUsdt: null,
      skippedReason: "No target amount recorded.",
      estimated: false,
    };
  }

  const cnyAmount = fromCny ? row.amount : row.targetAmount;
  const otherAmount = fromCny ? row.targetAmount : row.amount;
  const otherCurrency = fromCny ? row.targetCurrency : row.currency;

  const cnyRate = usdtRateAt(rates, "CNY", row.createdAt);
  const other = toUsdt(otherAmount, otherCurrency, rates, row.createdAt);

  if (!cnyRate || cnyRate.rate <= 0 || !other) {
    return {
      ...common,
      paidLabel,
      gotLabel,
      pnlUsdt: null,
      skippedReason: !cnyRate
        ? "No supplier rate on file for USDT/CNY."
        : `No supplier rate on file for USDT/${otherCurrency}.`,
      estimated: false,
    };
  }

  const cnyValueUsdt = cnyAmount / cnyRate.rate;
  // Selling yuan back: we take in yuan worth cnyValueUsdt and pay out the
  // other currency. Buying yuan: the reverse. Same subtraction, flipped.
  const pnlUsdt = fromCny ? cnyValueUsdt - other.usdt : other.usdt - cnyValueUsdt;

  return {
    ...common,
    paidLabel,
    gotLabel,
    pnlUsdt,
    skippedReason: null,
    estimated: cnyRate.estimated || other.estimated,
  };
}

/**
 * Pay to China: a yuan purchase and an immediate spend, as one row.
 *
 * A request funded from a CNY BALANCE contributes nothing here, deliberately.
 * That yuan's margin was realised when the customer converted into it; adding
 * it again when they spend it would count the same trade twice. It returns
 * null rather than a zero so the operator's "skipped" count stays honest —
 * nothing is missing, so nothing is reported as missing.
 */
function valuePayToChina(row: PnlInputRow, rates: SupplierRateRow[]): PnlOrder | null {
  if (row.currency === "CNY") return null;

  const common = base(row, "pay_to_china");
  const delivered = row.actualTargetAmount ?? row.targetAmount;
  const paidLabel = money(row.amount, row.currency);
  const gotLabel = delivered != null ? money(delivered, "CNY") : "—";

  if (delivered == null) {
    return {
      ...common,
      paidLabel,
      gotLabel,
      pnlUsdt: null,
      skippedReason: "No CNY amount recorded on this request.",
      estimated: false,
    };
  }

  const cnyRate = usdtRateAt(rates, "CNY", row.createdAt);
  const revenue = toUsdt(row.amount, row.currency, rates, row.createdAt);

  if (!cnyRate || cnyRate.rate <= 0 || !revenue) {
    return {
      ...common,
      paidLabel,
      gotLabel,
      pnlUsdt: null,
      skippedReason: !cnyRate
        ? "No supplier rate on file for USDT/CNY."
        : `No supplier rate on file for USDT/${row.currency}.`,
      estimated: false,
    };
  }

  return {
    ...common,
    paidLabel,
    gotLabel,
    pnlUsdt: revenue.usdt - delivered / cnyRate.rate,
    skippedReason: null,
    estimated: cnyRate.estimated || revenue.estimated,
  };
}

/** A withdrawal's fee, converted. The simplest route of the four. */
function valueWithdrawal(row: PnlInputRow, rates: SupplierRateRow[]): PnlOrder | null {
  if (row.targetAmount == null) return null;

  const common = base(row, "withdrawal_fee");
  const fee = row.amount - row.targetAmount;
  const paidLabel = money(row.amount, row.currency);
  const gotLabel = money(row.targetAmount, row.currency);

  const converted = toUsdt(fee, row.currency, rates, row.createdAt);
  if (!converted) {
    return {
      ...common,
      paidLabel,
      gotLabel,
      pnlUsdt: null,
      skippedReason: `No supplier rate on file for USDT/${row.currency}.`,
      estimated: false,
    };
  }

  return {
    ...common,
    paidLabel,
    gotLabel,
    pnlUsdt: converted.usdt,
    skippedReason: null,
    estimated: converted.estimated,
  };
}

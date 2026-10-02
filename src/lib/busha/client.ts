/**
 * Server-only. Thin fetch wrapper over Busha's Business API (docs.busha.io) —
 * the deposit/swap/payout provider for NGN, KES and USDT.
 *
 * One generic quote -> transfer pattern serves deposits, conversions and
 * payouts alike. The notes below were established against a real Busha
 * Business account, not read off the docs, and each one cost a live failure to
 * learn — they are preserved deliberately:
 *
 *   - A DEPOSIT is a same-currency quote (source_currency === target_currency)
 *     with a `pay_in` object. The resulting transfer's `pay_in` carries a
 *     temporary bank account (fiat) or a one-time receiving address (crypto)
 *     to show the user.
 *   - A CONVERSION is a quote between two different currencies; the transfer
 *     executes it directly, with no pay_in — the source balance already sits
 *     inside Busha.
 *   - A PAYOUT is a same-currency quote carrying a `pay_out` object.
 *
 * The base URL defaults to Busha's production host. A real registered Busha
 * Business account's secret key was rejected outright by the documented
 * sandbox host (api.sandbox.busha.so) but worked immediately against
 * api.busha.io — a real business account may simply have no usable sandbox
 * counterpart, so do not assume sandbox works before trying it.
 */

const BASE_URL = process.env.BUSHA_API_BASE_URL ?? "https://api.busha.io";

export class BushaError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "BushaError";
  }
}

async function request<T>(
  path: string,
  /**
   * revalidate: opt-in Next.js cache lifetime (seconds) for the rare read-only
   * endpoint that wants one (getBanks). Omitted everywhere else so every
   * mutating or time-sensitive call — quotes, transfers, recipients — stays
   * fully uncached, as it must.
   */
  options: { method: "GET" | "POST"; body?: unknown; revalidate?: number },
): Promise<T> {
  const apiKey = process.env.BUSHA_API_KEY;
  if (!apiKey) throw new BushaError("BUSHA_API_KEY is not configured", 500);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    ...(options.revalidate != null ? { next: { revalidate: options.revalidate } } : {}),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.status === "error") {
    // Busha's real error shape is {"error":{"name":..,"message":..}} — there is
    // no top-level `message` on an error response, so reading json.message
    // directly always falls through to the generic fallback.
    const message = json?.error?.message ?? json?.message ?? `Busha request failed (${res.status})`;
    console.error("[busha.request] error response", {
      path,
      status: res.status,
      error: json?.error ?? json,
    });
    // A bare "Request validation failed" is useless; the offending field is
    // usually under one of these keys. Append whichever is present.
    const detail = json?.error?.details ?? json?.error?.errors ?? json?.error?.fields;
    const detailText =
      detail != null ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : "";
    throw new BushaError(`${message}${detailText}`, res.status);
  }
  return json.data as T;
}

export type BushaPayInDetails = {
  type: string;
  address?: string;
  network?: string;
  expires_at?: string;
  /** Confirmed live: the field is `recipient_details`, not `payer_details`. */
  recipient_details?: {
    account_name?: string;
    account_number?: string;
    bank_name?: string;
    bank_code?: string;
    email?: string;
  };
};

export type BushaQuote = {
  id: string;
  source_currency: string;
  target_currency: string;
  source_amount: string;
  target_amount: string;
  rate: { rate: string; rate_explained: string };
  fees: { name: string; amount: { amount: string; currency: string } }[];
  reference: string;
  status: "pending" | "accepted" | "expired";
  expires_at: string;
};

export type BushaTransfer = {
  id: string;
  quote_id: string;
  reference: string;
  category: "deposit" | "withdrawal" | "conversion" | "buy" | "sell" | "send" | "exchange";
  source_currency: string;
  target_currency: string;
  source_amount: string;
  target_amount: string;
  pay_in: BushaPayInDetails;
  status:
    | "pending"
    | "processing"
    | "cancelled"
    | "funds_converted"
    | "funds_received"
    | "outgoing_payment_sent"
    | "funds_delivered"
    | "funds_not_delivered"
    | "funds_refunded"
    | "reverse_fund_conversion";
};

/**
 * POST /v1/quotes. Same currency for source/target gives a deposit or payout
 * quote (no conversion); different currencies give a conversion quote.
 *
 * Deposit `pay_in` shape depends on fiat vs crypto — confirmed live: fiat wants
 * `{type: "temporary_bank_account"}`, but a USDT deposit needs
 * `{type: "address", network: "BSC"}`. This account's USDT balance only accepts
 * BSC, NOT the more commonly assumed TRC20/ERC20 — both are rejected outright
 * ("Invalid network. TRC20/ERC20 is not supported by USDT").
 */
export function createQuote(params: {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount?: string;
  targetAmount?: string;
  isDeposit?: boolean;
  /**
   * A payout pays a quote's proceeds out. Confirmed against docs.busha.io's
   * payout guide: `pay_out: { type: "bank_transfer" | "mobile_money",
   * recipient_id }`. Per Busha's process-crypto-payouts guide (confirmed
   * directly with Busha support) the crypto/address payout type does NOT use a
   * Recipient at all — it goes straight to
   * `pay_out: { type: "address", address, network }`, no recipient_id anywhere.
   * So recipientId is optional and only sent when present.
   */
  payOut?: { type: string; recipientId?: string; address?: string; network?: string };
}): Promise<BushaQuote> {
  const currency = params.sourceCurrency.toUpperCase();
  const payIn = params.isDeposit
    ? currency === "USDT"
      ? { pay_in: { type: "address", network: "BSC" } }
      : { pay_in: { type: "temporary_bank_account" } }
    : {};
  const payOut = params.payOut
    ? {
        pay_out: {
          type: params.payOut.type,
          ...(params.payOut.recipientId ? { recipient_id: params.payOut.recipientId } : {}),
          ...(params.payOut.address ? { address: params.payOut.address } : {}),
          ...(params.payOut.network ? { network: params.payOut.network } : {}),
        },
      }
    : {};

  return request("/v1/quotes", {
    method: "POST",
    body: {
      source_currency: currency,
      target_currency: params.targetCurrency.toUpperCase(),
      ...(params.sourceAmount ? { source_amount: params.sourceAmount } : {}),
      ...(params.targetAmount ? { target_amount: params.targetAmount } : {}),
      ...payIn,
      ...payOut,
    },
  });
}

export type BushaRecipient = {
  id: string;
  type: string;
  currency?: string;
  country_code?: string;
  account_name?: string;
  account_number?: string;
  bank_name?: string;
  bank_code?: string;
  phone_number?: string;
  address?: string;
  network?: string;
};

/**
 * POST /v1/recipients. Field shape depends on `type`: ngn_bank/kes_bank need
 * bank_name + bank_code + account_number + account_name;
 * mpesa_mobile_money/mtn_mobile_money need phone_number + account_name; crypto
 * needs address + network + account_name. See src/lib/busha/payout.ts for the
 * currency -> type mapping.
 */
export function createRecipient(body: Record<string, string>): Promise<BushaRecipient> {
  return request("/v1/recipients", { method: "POST", body });
}

/** POST /v1/transfers — executes a quote by id. */
export function createTransfer(quoteId: string): Promise<BushaTransfer> {
  return request("/v1/transfers", { method: "POST", body: { quote_id: quoteId } });
}

export type BushaPair = {
  id: string;
  base: string;
  counter: string;
  buy_price: { amount: string; currency: string };
  sell_price: { amount: string; currency: string };
  is_buy_supported: boolean;
  is_sell_supported: boolean;
};

/**
 * GET /v1/pairs. Unlike /v1/quotes this needs no balance and no amount — it is
 * a live market lookup, not a reservation — and returns buy_price/sell_price as
 * two genuinely different numbers (confirmed live: USDT/NGN buy 1380.72, sell
 * 1364.26, a real ~1.2% spread).
 *
 * This is what makes a sell-side (USDT -> fiat) rate obtainable at all:
 * /v1/quotes in that direction fails "insufficient balance" whenever the
 * account's real USDT float is low, but /v1/pairs is unaffected since it never
 * reserves or moves anything.
 */
export async function getPair(base: string, counter: string): Promise<BushaPair | null> {
  const data = await request<BushaPair[]>(`/v1/pairs?base=${base}&counter=${counter}`, {
    method: "GET",
  });
  return data[0] ?? null;
}

/** GET /v1/transfers/{id} — the polling fallback when a webhook hasn't fired. */
export function getTransfer(transferId: string): Promise<BushaTransfer> {
  return request(`/v1/transfers/${transferId}`, { method: "GET" });
}

export type BushaBank = { name: string; code: string };

/**
 * GET /v1/banks. Confirmed directly with Busha support: Busha's ngn_bank
 * recipient type expects its OWN internal bank codes, not the standard NIBSS
 * codes a general bank-list provider returns — those are rejected outright.
 * This is the only correct source for the code createBushaRecipient needs.
 * Cached for a day; the bank list changes rarely.
 */
export async function getBanks(): Promise<BushaBank[]> {
  const banks = await request<{ name: string; code: string }[]>("/v1/banks", {
    method: "GET",
    revalidate: 60 * 60 * 24,
  });
  return banks.map((b) => ({ name: b.name, code: b.code }));
}

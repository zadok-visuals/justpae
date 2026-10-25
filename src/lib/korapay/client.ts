/**
 * Server-only. Thin fetch wrapper over Korapay's Merchant API
 * (developers.korapay.com) — the naira rail for permanent virtual accounts,
 * and a second payout route alongside Busha for NGN and KES.
 *
 * Shaped deliberately like src/lib/busha/client.ts: one private `request()`
 * that owns the key, the timeout, the e2e mock hook and the error shape, with
 * thin named functions over it. Two providers that fail in two different ways
 * is how a money path acquires a case nobody handled.
 *
 * WHAT DIFFERS FROM BUSHA, and why the differences are here rather than
 * papered over:
 *   - Korapay answers 200 with `{"status": false, "message": …}` on a refusal,
 *     so res.ok alone is not enough to decide a call succeeded.
 *   - It has a real sandbox. Test keys are `sk_test_`/`pk_test_` and hit the
 *     same host; there is no separate sandbox base URL to configure.
 *   - Every request carries an AbortSignal timeout. Busha's client has none,
 *     and a payout call that hangs holds a serverless invocation open until
 *     the platform kills it — at which point we do not know whether the payout
 *     happened. See queryDisbursement: the answer to a timeout is to ask.
 */

import {
  MOCK_MISS,
  MockProviderMissError,
  e2eProviderMocksEnabled,
  mockKorapayRequest,
} from "@/lib/e2e/mockProviders";
import { timed } from "@/lib/perf/timing";

const BASE_URL = process.env.KORAPAY_API_BASE_URL ?? "https://api.korapay.com/merchant/api/v1";

/** Reads, which are cheap and safe to give up on. */
const READ_TIMEOUT_MS = 15_000;
/**
 * Writes. Longer, because abandoning a disbursement request early does NOT
 * abandon the disbursement — it only abandons our knowledge of it.
 */
const WRITE_TIMEOUT_MS = 30_000;

export class KorapayError extends Error {
  constructor(
    message: string,
    public status: number,
    /**
     * The provider's verbatim body, carried on the error rather than only
     * logged at the throw site, so one log line at the catch can hold the
     * status, the body and our own context together. Never rendered to a
     * customer — see src/lib/providers/failure.ts.
     */
    public body?: unknown,
    /** True when the request timed out or the socket failed, rather than the
     *  provider answering. The one case where "did it happen?" is unknown. */
    public indeterminate = false,
  ) {
    super(message);
    this.name = "KorapayError";
  }
}

type KorapayEnvelope<T> = { status?: boolean; message?: string; data?: T };

/**
 * WHICH KEY SIGNS WHICH CALL — established live against the sandbox, not read
 * off the docs, and the single most surprising thing about this API.
 *
 * The reference LISTS under /misc — GET /misc/banks and GET /misc/mobile-money
 * — answer 401 "Invalid authentication token" to the SECRET key and 200 to the
 * PUBLIC one. Everything transactional (/balances, /charges, /transactions,
 * /virtual-bank-account) is the other way round: 200 to the secret key, 403
 * "invalid authorization key" to the public one. POST /misc/banks/resolve
 * accepts either, and is signed with the public key here for consistency with
 * the rest of /misc.
 *
 * So this is not a preference. A client that sends one key everywhere has half
 * its endpoints dead, and the failure looks exactly like a revoked key.
 */
type KeyKind = "secret" | "public";

async function request<T>(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number; auth?: KeyKind },
): Promise<T> {
  // Before the key is read and before any socket is opened, exactly as the
  // Busha client does it, so a test run cannot reach the live API even with a
  // real key in the environment.
  if (e2eProviderMocksEnabled()) {
    const mocked = mockKorapayRequest(path, options.method, options.body);
    if (mocked === MOCK_MISS) throw new MockProviderMissError("korapay", options.method, path);
    return mocked as T;
  }

  const keyKind = options.auth ?? "secret";
  const apiKey =
    keyKind === "public" ? process.env.KORAPAY_PUBLIC_KEY : process.env.KORAPAY_SECRET_KEY;
  if (!apiKey) {
    throw new KorapayError(
      `KORAPAY_${keyKind === "public" ? "PUBLIC" : "SECRET"}_KEY is not configured`,
      500,
    );
  }

  const timeoutMs =
    options.timeoutMs ?? (options.method === "GET" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);

  let res: Response;
  try {
    res = await timed(`korapay ${options.method} ${path.split("?")[0]}`, () =>
      fetch(`${BASE_URL}${path}`, {
        method: options.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      }),
    );
  } catch (err) {
    // A timeout or a dead socket. The request may well have been received and
    // acted on, so this is flagged indeterminate and the payout path answers
    // it by querying rather than by assuming failure.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[korapay.request] no response", { path, method: options.method, message });
    throw new KorapayError(`Korapay request did not complete (${message})`, 0, null, true);
  }

  const json = (await res.json().catch(() => null)) as KorapayEnvelope<T> | null;

  // Both halves matter. Korapay answers 200 with status:false on a business
  // refusal, and a 4xx/5xx may carry no envelope at all.
  if (!res.ok || json?.status === false) {
    const message = json?.message ?? `Korapay request failed (${res.status})`;
    console.error("[korapay.request] error response", {
      path,
      method: options.method,
      status: res.status,
      message,
    });
    throw new KorapayError(message, res.status, json ?? null);
  }

  return json?.data as T;
}

// ── Virtual bank accounts (NGN deposits) ────────────────────────────────────

export type KorapayVirtualAccount = {
  account_reference: string;
  unique_id?: string;
  account_name: string;
  account_number: string;
  bank_code: string;
  bank_name: string;
  currency: string;
  status?: string;
  customer?: { name?: string; email?: string };
};

/**
 * POST /virtual-bank-account. `permanent: true` is what makes this a standing
 * account number the customer can save in their bank app, rather than the
 * one-shot account the rail this replaces handed out per deposit.
 *
 * `kyc.bvn` is required by Korapay for a permanent NGN account. It is passed
 * straight through and never logged — see src/lib/kyc/bvn.ts for the storage
 * and masking rules.
 */
export function createVirtualBankAccount(params: {
  accountName: string;
  accountReference: string;
  bankCode: string;
  customerName: string;
  customerEmail: string;
  bvn: string;
}): Promise<KorapayVirtualAccount> {
  return request("/virtual-bank-account", {
    method: "POST",
    body: {
      account_name: params.accountName,
      account_reference: params.accountReference,
      permanent: true,
      bank_code: params.bankCode,
      customer: { name: params.customerName, email: params.customerEmail },
      kyc: { bvn: params.bvn },
    },
  });
}

/** GET /virtual-bank-account/{reference} — our own reference, not Korapay's id. */
export function getVirtualBankAccount(reference: string): Promise<KorapayVirtualAccount> {
  return request(`/virtual-bank-account/${encodeURIComponent(reference)}`, { method: "GET" });
}

export type KorapayVbaTransaction = {
  reference: string;
  amount: string | number;
  currency: string;
  status: string;
  /** Present on a virtual-account credit; absent on other transaction kinds. */
  account_number?: string;
  virtual_bank_account?: { account_number?: string; account_reference?: string };
  transaction_date?: string;
  created_at?: string;
};

/**
 * GET /virtual-bank-account/transactions. The reconcile cron's only input —
 * with no webhook URL configured in the test dashboard, this is how a sandbox
 * deposit is ever noticed at all.
 */
export async function listVirtualAccountTransactions(params: {
  accountNumber: string;
  limit?: number;
}): Promise<KorapayVbaTransaction[]> {
  const query = new URLSearchParams({
    account_number: params.accountNumber,
    limit: String(params.limit ?? 50),
  });
  const data = await request<{ transactions?: KorapayVbaTransaction[] } | KorapayVbaTransaction[]>(
    `/virtual-bank-account/transactions?${query.toString()}`,
    { method: "GET" },
  );
  if (Array.isArray(data)) return data;
  return data?.transactions ?? [];
}

// ── Charges (what a webhook claims, re-asked of the provider) ───────────────

export type KorapayCharge = {
  reference: string;
  amount: string | number;
  /** What actually lands after Korapay's own fee. Not always present. */
  amount_paid?: string | number;
  fee?: string | number;
  currency: string;
  status: string;
  payment_method?: string;
  virtual_bank_account_details?: {
    account_number?: string;
    account_reference?: string;
    account_name?: string;
  };
};

/**
 * GET /charges/:reference. THE load-bearing call of the webhook route: the
 * payload's own amount and status are never acted on, only this.
 */
export function getCharge(reference: string): Promise<KorapayCharge> {
  return request(`/charges/${encodeURIComponent(reference)}`, { method: "GET" });
}

// ── Balances ────────────────────────────────────────────────────────────────

export type KorapayBalanceEntry = { pending_balance?: number; available_balance?: number };

/**
 * GET /balances. Returned as a map keyed by currency code, e.g.
 * `{ NGN: { available_balance: 1000, pending_balance: 0 } }`.
 */
export function getBalances(): Promise<Record<string, KorapayBalanceEntry>> {
  return request("/balances", { method: "GET" });
}

/** The available balance for one currency, or null when the key is absent. */
export async function getAvailableBalance(currency: string): Promise<number | null> {
  const balances = await getBalances();
  const entry = balances?.[currency.toUpperCase()];
  const value = entry?.available_balance;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ── Misc: banks, account resolution, mobile money ───────────────────────────

export type KorapayBank = {
  name: string;
  code: string;
  nibss_bank_code?: string;
  slug?: string;
  country?: string;
};

/**
 * GET /misc/banks?countryCode=NG. PUBLIC key — see the KeyKind note above.
 * Confirmed live in the sandbox: 574 NG entries, each carrying both Korapay's
 * `code` and the NIBSS code, which happen to be the same string for every
 * entry seen. `code` is the one the disburse and resolve calls take.
 */
export async function getBanks(countryCode = "NG"): Promise<KorapayBank[]> {
  const data = await request<KorapayBank[]>(`/misc/banks?countryCode=${countryCode}`, {
    method: "GET",
    auth: "public",
  });
  return data ?? [];
}

export type KorapayMobileMoneyOperator = {
  name: string;
  slug: string;
  code?: string;
  min?: number;
  max?: number;
  country?: string;
};

/**
 * GET /misc/mobile-money?countryCode=KE — the operator slugs an M-Pesa payout
 * needs. PUBLIC key. Enumerated rather than hardcoded because a wrong slug is
 * a payout that is accepted and then silently never arrives.
 */
export async function getMobileMoneyOperators(
  countryCode = "KE",
): Promise<KorapayMobileMoneyOperator[]> {
  const data = await request<KorapayMobileMoneyOperator[]>(
    `/misc/mobile-money?countryCode=${countryCode}`,
    { method: "GET", auth: "public" },
  );
  return data ?? [];
}

export type KorapayResolvedAccount = {
  account_number: string;
  account_name: string;
  bank_name?: string;
  bank_code?: string;
};

/**
 * POST /misc/banks/resolve. The name check before a payout: we require the
 * resolved name to match the customer's verified name, which is the only
 * thing standing between a mistyped account number and someone else's money.
 */
export function resolveBankAccount(params: {
  bankCode: string;
  accountNumber: string;
}): Promise<KorapayResolvedAccount> {
  return request("/misc/banks/resolve", {
    method: "POST",
    auth: "public",
    body: { bank: params.bankCode, account: params.accountNumber },
  });
}

// ── Payouts ─────────────────────────────────────────────────────────────────

export type KorapayDisbursement = {
  reference: string;
  amount?: string | number;
  fee?: string | number;
  currency?: string;
  status: string;
  narration?: string;
};

/**
 * POST /transactions/disburse, bank destination.
 *
 * `reference` is OUR withdrawal id, never a generated one. That is what makes
 * queryDisbursement answerable after a timeout: there is exactly one reference
 * per withdrawal, so asking "did this happen" is a lookup rather than a guess,
 * and a retry with the same reference is refused by Korapay rather than paying
 * twice.
 */
export function disburseToBank(params: {
  reference: string;
  amount: number;
  currency: string;
  bankCode: string;
  accountNumber: string;
  narration: string;
  customerName: string;
  customerEmail?: string;
}): Promise<KorapayDisbursement> {
  return request("/transactions/disburse", {
    method: "POST",
    body: {
      reference: params.reference,
      destination: {
        type: "bank_account",
        amount: String(params.amount),
        currency: params.currency.toUpperCase(),
        narration: params.narration,
        bank_account: { bank: params.bankCode, account: params.accountNumber },
        customer: {
          name: params.customerName,
          ...(params.customerEmail ? { email: params.customerEmail } : {}),
        },
      },
    },
  });
}

/** POST /transactions/disburse, mobile-money destination (KES M-Pesa). */
export function disburseToMobileMoney(params: {
  reference: string;
  amount: number;
  currency: string;
  operatorSlug: string;
  phoneNumber: string;
  narration: string;
  customerName: string;
  customerEmail?: string;
}): Promise<KorapayDisbursement> {
  return request("/transactions/disburse", {
    method: "POST",
    body: {
      reference: params.reference,
      destination: {
        type: "mobile_money",
        amount: String(params.amount),
        currency: params.currency.toUpperCase(),
        narration: params.narration,
        mobile_money: { operator: params.operatorSlug, mobile_number: params.phoneNumber },
        customer: {
          name: params.customerName,
          ...(params.customerEmail ? { email: params.customerEmail } : {}),
        },
      },
    },
  });
}

/**
 * GET /transactions/:reference — the answer to "we never heard back".
 * Never assume a timed-out payout failed; ask, and keep the hold until this
 * returns something terminal.
 */
export function queryDisbursement(reference: string): Promise<KorapayDisbursement> {
  return request(`/transactions/${encodeURIComponent(reference)}`, { method: "GET" });
}

/** Korapay's terminal payout states, in one place so no caller re-derives them. */
export function isDisbursementSuccess(status: string | undefined): boolean {
  return status === "success" || status === "successful";
}

export function isDisbursementFailure(status: string | undefined): boolean {
  return status === "failed" || status === "expired" || status === "reversed";
}

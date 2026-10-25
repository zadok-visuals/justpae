/**
 * The deterministic stand-in for every payment provider, used by the
 * end-to-end suite and by nothing else.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHERE IT HOOKS IN, AND WHY THERE
 *
 * One branch at the top of each provider client's private `request()` —
 * src/lib/busha/client.ts and src/lib/klasha/client.ts — rather than a
 * swappable `BushaClient` interface threaded through every caller.
 *
 * That is a deliberate trade. An interface would be tidier in the abstract,
 * but it would mean every money path in the app routes through an indirection
 * that exists only for tests, and a mistake in the wiring would be invisible
 * until something paid the wrong person. A single early return inside the one
 * function that owns the network call cannot be mis-wired: either the real
 * fetch below it runs, or it does not. It is also the only place guaranteed to
 * catch EVERY provider call, including ones added later by someone who never
 * read this file — which an interface, by construction, would not.
 *
 * WHAT IS NOT MOCKED: Supabase. The suite runs against a real database with
 * real rows, because the invariants worth testing (balance holds, PIN gates,
 * suspension, the service-role boundary) all live there. Only the provider
 * network edge is faked, and only the money never leaves because of it.
 *
 * SAFETY: every entry point re-asserts the guard. See guard.ts for why a
 * build-time check alone is not enough.
 */

import { assertE2eProviderMocksAreSafe, e2eProviderMocksEnabled } from "./guard";

export { e2eProviderMocksEnabled };

/**
 * A mock response, or MOCK_MISS for a path the mock does not know. A miss is
 * reported loudly rather than passed through to the real provider: a test that
 * silently reached the live API is the exact outcome this whole module exists
 * to prevent.
 */
export const MOCK_MISS = Symbol("e2e.mock.miss");

/** Fixed so a test can assert on them. Not real market rates. */
const MOCK_PAIR_PRICES: Record<string, { buy: string; sell: string }> = {
  "USDT-NGN": { buy: "1500.00", sell: "1480.00" },
  "USDT-KES": { buy: "130.00", sell: "128.00" },
  "USDT-USD": { buy: "1.01", sell: "0.99" },
  "USDT-CNY": { buy: "7.20", sell: "7.10" },
  "NGN-USDT": { buy: "0.00067", sell: "0.00066" },
  "KES-USDT": { buy: "0.0078", sell: "0.0077" },
};

/** Flat fee per currency, mirroring the shape the real provider returns. */
const MOCK_DEPOSIT_FEE: Record<string, number> = { NGN: 100, KES: 0, USDT: 0, GHS: 0 };

/** A deterministic id so a test can predict (and a log can be traced to) it. */
let counter = 0;
function mockId(prefix: string): string {
  counter += 1;
  return `${prefix}_e2e_${String(counter).padStart(6, "0")}`;
}

function nowPlus(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

type Body = Record<string, unknown>;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mockQuote(body: Body): unknown {
  const source = String(body.source_currency ?? "").toUpperCase();
  const target = String(body.target_currency ?? "").toUpperCase();
  const isDeposit = body.pay_in != null;

  if (source === target) {
    // A deposit or a payout: no conversion, a flat fee deducted on the way in.
    const fee = MOCK_DEPOSIT_FEE[source] ?? 0;
    const sourceAmount = body.source_amount != null ? num(body.source_amount) : num(body.target_amount) + fee;
    return {
      id: mockId("qt"),
      source_currency: source,
      target_currency: target,
      source_amount: sourceAmount.toFixed(2),
      target_amount: Math.max(0, sourceAmount - fee).toFixed(2),
      rate: { rate: "1", rate_explained: `1 ${source} = 1 ${target}` },
      fees: fee > 0 ? [{ name: "gateway", amount: { amount: fee.toFixed(2), currency: source } }] : [],
      reference: mockId("ref"),
      status: isDeposit ? "pending" : "pending",
      expires_at: nowPlus(15),
    };
  }

  const pair = MOCK_PAIR_PRICES[`${target}-${source}`];
  // source -> target. If USDT/NGN sells at 1480, then NGN -> USDT divides.
  const rate = pair ? 1 / Number(pair.sell) : Number(MOCK_PAIR_PRICES[`${source}-${target}`]?.sell ?? 1);
  const sourceAmount = num(body.source_amount);
  return {
    id: mockId("qt"),
    source_currency: source,
    target_currency: target,
    source_amount: sourceAmount.toFixed(2),
    target_amount: (sourceAmount * rate).toFixed(2),
    rate: { rate: String(rate), rate_explained: `1 ${source} = ${rate} ${target}` },
    fees: [],
    reference: mockId("ref"),
    status: "pending",
    expires_at: nowPlus(15),
  };
}

/**
 * Transfers the mock has handed out, so getTransfer can answer consistently
 * and a test can drive a deposit from pending to funds_received.
 *
 * In-process and intentionally not persisted: the suite runs one server.
 */
const transfers = new Map<string, Record<string, unknown>>();

/** The same, for Korapay payouts, so querying one answers like the real API. */
const disbursements = new Map<string, Record<string, string>>();

/**
 * Lets a test advance a deposit without waiting on a provider. Called from the
 * E2E-only route handler, which is itself behind the same guard.
 */
export function advanceMockTransfer(id: string, status: string): boolean {
  const existing = transfers.get(id);
  if (!existing) return false;
  existing.status = status;
  return true;
}

function mockTransfer(body: Body): unknown {
  const id = mockId("tr");
  // The quote id is all createTransfer sends, so the mock cannot recover the
  // quote's currency from it. It does not need to: every assertion the suite
  // makes about a deposit reads our own `deposits` row, which was written from
  // the quote. What the transfer must carry is the pay_in payload the UI
  // renders, which is currency-shaped rather than amount-shaped.
  const quoteId = String(body.quote_id ?? "");
  const record = {
    id,
    quote_id: quoteId,
    reference: mockId("ref"),
    category: "deposit",
    source_currency: "NGN",
    target_currency: "NGN",
    source_amount: "0.00",
    target_amount: "0.00",
    status: "pending",
    pay_in: {
      type: "temporary_bank_account",
      expires_at: nowPlus(30),
      recipient_details: {
        account_name: "JUSTPAE E2E COLLECTIONS",
        account_number: "0123456789",
        bank_name: "Mock Test Bank",
        bank_code: "999",
      },
    },
  };
  transfers.set(id, record);
  return record;
}

function mockUsdtTransfer(): Record<string, unknown> {
  const id = mockId("tr");
  const record = {
    id,
    quote_id: mockId("qt"),
    reference: mockId("ref"),
    category: "deposit",
    source_currency: "USDT",
    target_currency: "USDT",
    source_amount: "0.00",
    target_amount: "0.00",
    status: "pending",
    pay_in: {
      type: "address",
      network: "BSC",
      address: "0x000000000000000000000000000000000000dEaD",
      expires_at: nowPlus(30),
    },
  };
  transfers.set(id, record);
  return record;
}

const MOCK_BANKS = [
  { name: "Mock Test Bank", code: "999" },
  { name: "Access Bank", code: "044" },
  { name: "GTBank", code: "058" },
  { name: "Zenith Bank", code: "057" },
];

/**
 * The Busha surface. Returns MOCK_MISS for anything unrecognised so the caller
 * can fail loudly instead of falling through to the network.
 */
export function mockBushaRequest(
  path: string,
  method: "GET" | "POST",
  body: unknown,
): unknown | typeof MOCK_MISS {
  assertE2eProviderMocksAreSafe();
  const payload = (body ?? {}) as Body;

  if (method === "POST" && path === "/v1/quotes") return mockQuote(payload);

  if (method === "POST" && path === "/v1/transfers") {
    // A USDT deposit is distinguishable only by the quote the test asked for,
    // which the transfer body does not carry — so the suite drives the USDT
    // path through its own marker in the quote id.
    return String(payload.quote_id ?? "").includes("usdt") ? mockUsdtTransfer() : mockTransfer(payload);
  }

  if (method === "POST" && path === "/v1/recipients") {
    return { id: mockId("rc"), type: String(payload.type ?? "ngn_bank"), ...payload };
  }

  if (method === "GET" && path.startsWith("/v1/pairs")) {
    const url = new URL(path, "https://mock.invalid");
    const base = (url.searchParams.get("base") ?? "").toUpperCase();
    const counter_ = (url.searchParams.get("counter") ?? "").toUpperCase();
    const price = MOCK_PAIR_PRICES[`${base}-${counter_}`];
    if (!price) return [];
    return [
      {
        id: `${base}-${counter_}`,
        base,
        counter: counter_,
        buy_price: { amount: price.buy, currency: counter_ },
        sell_price: { amount: price.sell, currency: counter_ },
        is_buy_supported: true,
        is_sell_supported: true,
      },
    ];
  }

  if (method === "GET" && path.startsWith("/v1/transfers/")) {
    const id = path.slice("/v1/transfers/".length);
    return transfers.get(id) ?? MOCK_MISS;
  }

  if (method === "GET" && path.startsWith("/v1/banks")) return MOCK_BANKS;

  // Generous on purpose: the balance gate must never be the reason an e2e
  // payout is held back.
  if (method === "GET" && path.startsWith("/v1/balances")) {
    return ["NGN", "KES", "USD", "USDT"].map((currency) => ({
      currency,
      type: currency === "USDT" ? "crypto" : "fiat",
      available: { amount: "1000000" },
      pending: { amount: "0" },
    }));
  }

  return MOCK_MISS;
}

/**
 * The Korapay surface. Mirrors the client's envelope UNWRAPPED — the real
 * client returns `json.data`, and the mock hook sits inside request() after
 * that unwrapping would have happened, so these are `data` bodies.
 */
export function mockKorapayRequest(
  path: string,
  method: "GET" | "POST",
  body: unknown,
): unknown | typeof MOCK_MISS {
  assertE2eProviderMocksAreSafe();
  const payload = (body ?? {}) as Body;

  if (method === "POST" && path === "/virtual-bank-account") {
    return {
      account_reference: String(payload.account_reference ?? mockId("vba")),
      account_name: String(payload.account_name ?? "justpae Test User"),
      account_number: "1234567890",
      bank_code: String(payload.bank_code ?? "000"),
      bank_name: "Mock Test Bank",
      currency: "NGN",
      status: "active",
    };
  }

  if (method === "GET" && path.startsWith("/virtual-bank-account/transactions")) {
    return { transactions: [] };
  }

  if (method === "GET" && path.startsWith("/balances")) {
    return { NGN: { available_balance: 1_000_000, pending_balance: 0 } };
  }

  if (method === "GET" && path.startsWith("/misc/banks")) {
    return MOCK_BANKS.map((bank) => ({ ...bank, slug: bank.name.toLowerCase() }));
  }

  if (method === "POST" && path === "/misc/banks/resolve") {
    return { account_number: String(payload.account ?? ""), account_name: "Mock Test User" };
  }

  // The live slugs, verbatim. A mock operator list that does not match the
  // real one tests a payout nobody can actually send.
  if (method === "GET" && path.startsWith("/misc/mobile-money")) {
    return [
      { name: "SAFARICOM", slug: "safaricom-ke", country: "KE" },
      { name: "AIRTEL", slug: "airtel-ke", country: "KE" },
    ];
  }

  if (method === "POST" && path === "/transactions/disburse") {
    const destination = (payload.destination ?? {}) as Body;
    const reference = String(payload.reference ?? mockId("kpo"));
    const sent = {
      reference,
      amount: String(destination.amount ?? "0"),
      currency: String(destination.currency ?? "NGN"),
      status: "processing",
    };
    disbursements.set(reference, sent);
    return sent;
  }

  if (method === "GET" && path.startsWith("/transactions/")) {
    const reference = decodeURIComponent(path.slice("/transactions/".length));
    return disbursements.get(reference) ?? MOCK_MISS;
  }

  return MOCK_MISS;
}

/** The Klasha surface. Only the collection endpoint is reachable from the app. */
export function mockKlashaRequest(
  path: string,
  method: "GET" | "POST",
  body: unknown,
): unknown | typeof MOCK_MISS {
  assertE2eProviderMocksAreSafe();
  const payload = (body ?? {}) as Body;

  if (method === "POST" && path.includes("/banktransfer/")) {
    return {
      tx_ref: String(payload.tx_ref ?? mockId("tx")),
      status: "pending",
      meta: {
        authorization: {
          mode: "redirect",
          redirect: "http://localhost:3000/home?mock_collection=1",
        },
      },
    };
  }

  return MOCK_MISS;
}

/**
 * Thrown on a miss. Its message names the unmocked call so the fix is obvious
 * from the test output alone.
 */
export class MockProviderMissError extends Error {
  constructor(provider: string, method: string, path: string) {
    super(
      `[e2e] ${provider} ${method} ${path} has no mock. The suite must never reach a live ` +
        `provider; add it to src/lib/e2e/mockProviders.ts.`,
    );
    this.name = "MockProviderMissError";
  }
}

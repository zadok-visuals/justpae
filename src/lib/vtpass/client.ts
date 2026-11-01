/**
 * VTpass HTTP client — src/lib/vtpass/client.ts
 *
 * Covers the three endpoints this product needs:
 *   GET  /api/balance          — wallet health check
 *   POST /api/merchant-verify  — customer name lookup before paying
 *   POST /api/pay              — vend airtime, data, electricity, cable, etc.
 *   POST /api/requery          — re-check a transaction if a timeout occurred
 *
 * Auth:
 *   GET  requests: api-key + public-key headers
 *   POST requests: api-key + secret-key headers
 *
 * Sandbox:  https://sandbox.vtpass.com
 * Live:     https://vtpass.com
 *
 * NEVER expose secret-key to the browser — all calls here are server-only.
 */

export interface VTpassConfig {
  apiKey: string;
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

function config(): VTpassConfig {
  const apiKey = process.env.VTPASS_API_KEY ?? "";
  const publicKey = process.env.VTPASS_PUBLIC_KEY ?? "";
  const secretKey = process.env.VTPASS_SECRET_KEY ?? "";
  const baseUrl =
    process.env.VTPASS_BASE_URL?.replace(/\/$/, "") ?? "https://sandbox.vtpass.com";

  if (!apiKey || !secretKey) {
    throw new Error("[vtpass] VTPASS_API_KEY or VTPASS_SECRET_KEY is not set");
  }

  return { apiKey, publicKey, secretKey, baseUrl };
}

async function getRequest<T>(path: string): Promise<T> {
  const { apiKey, publicKey, baseUrl } = config();
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "api-key": apiKey,
      "public-key": publicKey,
    },
    // VTpass reads aren't cached — balance and catalogue can change at any time.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[vtpass] GET ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}

async function postRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { apiKey, secretKey, baseUrl } = config();
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "secret-key": secretKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[vtpass] POST ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}

// ── Response shapes (minimal — we only extract what we use) ─────────────────

export interface VTpassBalanceResponse {
  code: string;
  response_description: string;
  wallet: {
    balance: string;
  };
}

export interface VTpassVariation {
  variation_code: string;
  name: string;
  variation_amount: string;
  fixedPrice: "Yes" | "No";
}

export interface VTpassServiceVariationsResponse {
  response_description: string;
  content?: {
    ServiceName?: string;
    serviceID?: string;
    convinience_fee?: string;
    variations?: VTpassVariation[];
  };
}

export interface VTpassVerifyResponse {
  code: string;
  response_description: string;
  content?: {
    Customer_Name?: string;
    Outstanding_Balance?: string;
    error?: string;
  };
}

export interface VTpassPayResponse {
  code: string;
  response_description: string;
  requestId: string;
  transactionId?: string;
  amount?: string | number;
  content?: {
    transactions?: {
      status?: string;
      product_name?: string;
      unique_element?: string;
      unit_cost?: string | number;
      quantity?: number;
      service_verification?: string | null;
      channel?: string;
      discount?: string | null;
      commission?: string | null;
      total_amount?: string | number;
      balance_before?: string | number;
      balance_after?: string | number;
      country?: string;
      response_reference?: string;
      requestId?: string;
      transactionId?: string;
      type?: string;
      email?: string;
    };
    error?: string;
  };
  purchased_code?: string; // electricity token
}

// ── Public functions ─────────────────────────────────────────────────────────

export function isVTpassConfigured(): boolean {
  const apiKey = process.env.VTPASS_API_KEY ?? "";
  const secretKey = process.env.VTPASS_SECRET_KEY ?? "";
  return Boolean(apiKey && secretKey);
}

export async function vtpassBalance(): Promise<VTpassBalanceResponse> {
  return getRequest<VTpassBalanceResponse>("/api/balance");
}

export async function vtpassVerify(params: {
  serviceID: string;
  billersCode: string;
  type?: "prepaid" | "postpaid";
}): Promise<VTpassVerifyResponse> {
  return postRequest<VTpassVerifyResponse>("/api/merchant-verify", {
    serviceID: params.serviceID,
    billersCode: params.billersCode,
    ...(params.type ? { type: params.type } : {}),
  });
}

export async function vtpassPay(params: {
  request_id: string;
  serviceID: string;
  billersCode?: string;
  variation_code?: string;
  amount: number;
  /** Customer's Nigerian phone number for SMS notifications. For airtime/data
   *  this doubles as the recipient; for metered services it is contact-only. */
  phone: string;
}): Promise<VTpassPayResponse> {
  return postRequest<VTpassPayResponse>("/api/pay", {
    request_id: params.request_id,
    serviceID: params.serviceID,
    ...(params.billersCode ? { billersCode: params.billersCode } : {}),
    ...(params.variation_code ? { variation_code: params.variation_code } : {}),
    amount: params.amount,
    phone: params.phone,
  });
}

/**
 * Fetches the available variation codes for a service (data bundles, cable TV
 * plans, etc.). Required before calling vtpassPay for data and cable services,
 * since VTpass mandates a `variation_code` for those categories.
 */
export async function vtpassServiceVariations(
  serviceID: string,
): Promise<VTpassServiceVariationsResponse> {
  return getRequest<VTpassServiceVariationsResponse>(
    `/api/service-variations?serviceID=${encodeURIComponent(serviceID)}`,
  );
}

export async function vtpassRequery(requestId: string): Promise<VTpassPayResponse> {
  return postRequest<VTpassPayResponse>("/api/requery", {
    request_id: requestId,
  });
}

/**
 * Generates a VTpass-compliant request_id: YYYYMMDDHHmm + 8 random chars.
 * This is ALSO stored as our idempotency key — passing our own DB row id as
 * the reference is not the VTpass pattern. Instead, we store the request_id
 * we generated and keep it on the bill_payments row for requery.
 */
export function generateRequestId(): string {
  const now = new Date();
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  const ts = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join("");
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${ts}${rand}`;
}

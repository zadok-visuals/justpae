import { createCipheriv, createDecipheriv } from "node:crypto";

/**
 * Server-only. Thin fetch wrapper over Klasha's Payments/Collection API, used
 * for GHS deposit collection ONLY.
 *
 * Why GHS is here at all: the primary provider rejects GHS outright on this
 * account ("Invalid Currency GHS"), so GHS deposit has no other route. NGN,
 * KES and USDT deposits all go through the primary provider and never touch
 * this file.
 *
 * THE WHOLE MODULE IS BEHIND A FEATURE FLAG THAT SHIPS OFF
 * (NEXT_PUBLIC_FEATURE_KLASHA_GHS_DEPOSIT). It has never completed a single
 * live call: every attempt has returned the same account-wide 403, including a
 * bodyless GET, which means the account itself is not cleared rather than the
 * request being malformed. Shipping it enabled would show GHS as depositable
 * and then fail every attempt.
 *
 * Confirmed from the provider's own documentation and a support call, not
 * guessed:
 *   - `productType: "COLLECTION"`, currency enum NGN|ZAR|GHS. No KES, no
 *     crypto anywhere in this API.
 *   - Auth is a two-header scheme and neither header replaces the other:
 *     1. POST /auth/account/v2/login with { username, password } — a business
 *        ACCOUNT login, not an API-key pair — returns a JWT.
 *     2. Every later request sends `Authorization: Bearer <JWT>` AND
 *        `x-auth-token: <public key>` together.
 *   - Token lifetime is undocumented, confirmed directly with support. This
 *     decodes the JWT's own `exp` claim and refreshes shortly before it rather
 *     than assuming a TTL or waiting to be rejected.
 *   - The base host is the provider's real intentional one, just not branded
 *     as their public domain. Overridable, because "dev" in a hostname is
 *     worth staying cautious about in case a separate production host exists.
 *
 * STILL UNVERIFIED, and the reason the flag is off rather than merely untested:
 *   1. The encryption scheme below is probably WRONG. The documentation says
 *      3DES, which needs a 16- or 24-byte key, but the real secret
 *      base64-decodes to exactly 32 bytes — a valid AES-256 length and an
 *      invalid 3DES one. Try AES-256-CBC (32-byte key, 16-byte IV) first once
 *      account access clears, rather than assuming 3DES is right because the
 *      docs say so.
 *   2. Whether the collection webhook payload is encrypted the same way as
 *      request bodies is undocumented. The webhook route attempts a plaintext
 *      parse first and falls back to decryption.
 */

const BASE_URL = process.env.KLASHA_API_BASE_URL ?? "https://dev.kcookery.com";

export class KlashaError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "KlashaError";
  }
}

/**
 * 3DES-CBC, key as supplied, IV = first 8 bytes, base64 out — per the
 * provider's documented algorithm section. See the header: the key length
 * strongly suggests this is actually AES-256, and this has never round-tripped
 * against a live response.
 */
function encryptBody(payload: unknown): string {
  const secret = process.env.KLASHA_ENCRYPTION_SECRET;
  if (!secret) throw new KlashaError("KLASHA_ENCRYPTION_SECRET is not configured", 500);

  const key = Buffer.from(secret, "utf8");
  const iv = key.subarray(0, 8);
  const cipher = createCipheriv("des-ede3-cbc", key, iv);
  return Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]).toString("base64");
}

export function decryptBody(encrypted: string): unknown {
  const secret = process.env.KLASHA_ENCRYPTION_SECRET;
  if (!secret) throw new KlashaError("KLASHA_ENCRYPTION_SECRET is not configured", 500);

  const key = Buffer.from(secret, "utf8");
  const iv = key.subarray(0, 8);
  const decipher = createDecipheriv("des-ede3-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted);
}

/** Reads a JWT's own `exp` claim, since no fixed lifetime is documented. */
function decodeJwtExpiryMs(token: string): number | null {
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export interface KlashaSession {
  token: string;
  /** ms since epoch, decoded from the JWT itself. */
  expiresAt: number;
}

let cachedSession: KlashaSession | null = null;
const TOKEN_REFRESH_MARGIN_MS = 90_000;

export async function login(): Promise<KlashaSession> {
  const username = process.env.KLASHA_LOGIN_EMAIL;
  const password = process.env.KLASHA_LOGIN_PASSWORD;
  if (!username || !password) {
    throw new KlashaError("KLASHA_LOGIN_EMAIL / KLASHA_LOGIN_PASSWORD are not configured", 500);
  }

  const res = await fetch(`${BASE_URL}/auth/account/v2/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const json = await res.json().catch(() => null);
  const token: string | undefined = json?.data?.token;
  if (!res.ok || json?.error || !token) {
    throw new KlashaError(
      json?.message ?? json?.error ?? `Klasha login failed (${res.status})`,
      res.status,
    );
  }

  const expiresAt = decodeJwtExpiryMs(token);
  if (expiresAt == null) throw new KlashaError("Klasha login token has no readable expiry", 500);

  cachedSession = { token, expiresAt };
  return cachedSession;
}

async function getValidToken(): Promise<string> {
  if (cachedSession && cachedSession.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cachedSession.token;
  }
  return (await login()).token;
}

async function request<T>(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown },
  isRetry = false,
): Promise<T> {
  const publicKey = process.env.KLASHA_PUBLIC_KEY;
  if (!publicKey) throw new KlashaError("KLASHA_PUBLIC_KEY is not configured", 500);

  const token = await getValidToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-auth-token": publicKey,
    },
    body: options.body ? JSON.stringify({ message: encryptBody(options.body) }) : undefined,
  });

  // A token can be invalidated server-side before its decoded exp. One fresh
  // login and one retry, rather than trusting the decoded expiry absolutely.
  if (res.status === 401 && !isRetry) {
    cachedSession = null;
    return request(path, options, true);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) {
    throw new KlashaError(
      json?.message ?? json?.error ?? `Klasha request failed (${res.status})`,
      res.status,
    );
  }
  return (json.data ?? json) as T;
}

export type KlashaCollectionResult = {
  tx_ref: string;
  meta: {
    authorization: {
      mode: "banktransfer" | "redirect";
      transfer_account?: string;
      transfer_bank?: string;
      transfer_amount?: number;
      account_expiration?: string;
      redirect?: string;
    };
  };
  status: string;
};

/**
 * POST /pay/aggregators/{currency}/banktransfer/v3 — deposit collection.
 *
 * GHS returns a redirect to the provider's hosted payment page (confirmed from
 * the docs, not guessed). There is no separate quote or fee-preview step for
 * this endpoint, unlike the primary provider's quote-then-transfer pattern, so
 * the deposit UI cannot show a fee before the user commits on this path.
 */
export function createCollection(params: {
  txRef: string;
  currency: "GHS";
  amount: string;
  email: string;
  phoneNumber: string;
  fullName: string;
  redirectUrl: string;
}): Promise<KlashaCollectionResult> {
  return request(`/pay/aggregators/${params.currency}/banktransfer/v3`, {
    method: "POST",
    body: {
      tx_ref: params.txRef,
      amount: params.amount,
      email: params.email,
      phone_number: params.phoneNumber,
      currency: params.currency,
      narration: "justpae wallet deposit",
      rate: 1,
      paymentType: "woo",
      productType: "COLLECTION",
      sourceCurrency: params.currency,
      sourceAmount: Number(params.amount),
      fullname: params.fullName,
      redirect_url: params.redirectUrl,
    },
  });
}

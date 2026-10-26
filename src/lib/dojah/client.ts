/**
 * Server-only. Thin fetch wrapper over Dojah's BVN validation endpoint
 * (docs.dojah.io/docs/nigeria/validate-bvn) — shaped like
 * src/lib/korapay/client.ts: one private request(), the key, the timeout and
 * a structured error, with a single named function over it.
 *
 * NEVER LOGS THE BVN OR THE RESPONSE BODY. A BVN identifies a person across
 * every bank in Nigeria — see src/lib/kyc/bvn.ts — and this call carries one
 * in its own query string. DojahError therefore never carries the response
 * body (unlike KorapayError, which does): there is nothing here worth
 * logging that isn't already a status code, and a body attached to an error
 * is a body one `console.error` away from a log line.
 */

import { timed } from "@/lib/perf/timing";

function baseUrl(): string {
  return process.env.DOJAH_BASE_URL ?? "https://sandbox.dojah.io";
}

const TIMEOUT_MS = 15_000;

export class DojahError extends Error {
  constructor(
    message: string,
    public status: number,
    /** True for a timeout or dead socket — Dojah never answered at all,
     *  rather than answering with a refusal. */
    public indeterminate = false,
  ) {
    super(message);
    this.name = "DojahError";
  }
}

/** One field's match verdict, confirmed against Dojah's documented response
 *  shape: `{ entity: { first_name: { confidence_value, status }, ... } }`. */
export interface DojahMatchField {
  confidence_value?: number;
  status?: boolean;
}

export interface DojahBvnEntity {
  bvn?: { value?: string; status?: boolean };
  first_name?: DojahMatchField;
  last_name?: DojahMatchField;
}

export interface DojahBvnResponse {
  entity?: DojahBvnEntity;
}

/**
 * GET /api/v1/kyc/bvn?bvn=...&first_name=...&last_name=...&dob=...
 *
 * `dob` is sent only when the caller has one — this app does not currently
 * store a date of birth, so every call today omits it.
 */
export async function validateBvn(params: {
  bvn: string;
  firstName: string;
  lastName: string;
  dob?: string;
}): Promise<DojahBvnResponse> {
  const appId = process.env.DOJAH_APP_ID;
  const secretKey = process.env.DOJAH_SECRET_KEY;
  if (!appId || !secretKey) {
    throw new DojahError("DOJAH_APP_ID or DOJAH_SECRET_KEY is not configured", 500);
  }

  const query = new URLSearchParams({
    bvn: params.bvn,
    first_name: params.firstName,
    last_name: params.lastName,
  });
  if (params.dob) query.set("dob", params.dob);

  let res: Response;
  try {
    res = await timed("dojah GET /api/v1/kyc/bvn", () =>
      fetch(`${baseUrl()}/api/v1/kyc/bvn?${query.toString()}`, {
        method: "GET",
        headers: {
          // No "Bearer" prefix — Dojah's secret key is the header value as-is.
          Authorization: secretKey,
          AppId: appId,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[dojah.validateBvn] no response", { message });
    throw new DojahError("Dojah request did not complete", 0, true);
  }

  if (!res.ok) {
    // 402 means the account's Dojah wallet is empty — callers treat that the
    // same as any other outage (don't block the user; see src/lib/actions/kyc.ts).
    console.error("[dojah.validateBvn] error response", { status: res.status });
    throw new DojahError(`Dojah request failed (${res.status})`, res.status);
  }

  const json = (await res.json().catch(() => null)) as DojahBvnResponse | null;
  return json ?? {};
}

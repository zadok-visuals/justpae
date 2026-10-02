import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Bearer-token gate for every cron route.
 *
 * FAILS CLOSED. The version of this check these routes inherited read
 * `if (cronSecret && authHeader !== ...)`, which means that with CRON_SECRET
 * unset — a fresh deploy, a forgotten environment variable, a renamed
 * variable — the gate evaluated to false and every reconciliation endpoint was
 * publicly callable by anyone who knew the path. Those endpoints credit
 * deposits and complete payouts.
 *
 * So: no secret configured means no access, and the log says exactly why
 * rather than leaving a 401 to be misread as a wrong token.
 */
export function requireCronSecret(request: Request, routeName: string): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error(`[${routeName}] CRON_SECRET is not configured — refusing to run`);
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);

  if (!ok) {
    console.warn(`[${routeName}] rejected a call with a missing or invalid Authorization header`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

/**
 * How long a row must have been pending before a reconciler touches it.
 *
 * Long enough that a healthy webhook or the user's own status poll normally
 * wins the race, so the reconciler is a safety net rather than a competitor —
 * every completion function is idempotent, but a reconciler firing seconds
 * after submission mostly just doubles the provider API calls.
 */
export const STALE_AFTER_MINUTES = 15;

export function staleCutoff(): string {
  return new Date(Date.now() - STALE_AFTER_MINUTES * 60_000).toISOString();
}

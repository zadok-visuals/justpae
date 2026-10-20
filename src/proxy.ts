import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { e2eProviderMocksEnabled } from "@/lib/e2e/guard";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy` (and the exported
 * function with it). The `edge` runtime is not supported here; `proxy` always
 * runs on nodejs and that is not configurable.
 */
export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  // GROUP 12. HSTS lives here, evaluated per request, rather than as a static
  // header in next.config.ts: Next bakes next.config.ts's headers() into the
  // build's routes manifest at `next build` time, so a flag read there only
  // reflects whatever the BUILD step's environment happened to be — not
  // `next start`'s, which is where the e2e harness actually sets
  // E2E_MOCK_PROVIDERS. Baked unconditionally, the header made a real browser
  // upgrade its SECOND request to the e2e harness's own `127.0.0.1` origin to
  // https://, which has nothing listening — every request after the one that
  // first set it failed with ERR_SSL_PROTOCOL_ERROR. (A separate bug, this
  // session's egress proxy rewriting Authorization headers to the Supabase
  // host, is what actually blocks the authed suite end to end — see
  // docs/QA_REPORT.md §6.2. Both are real; this one is fixed by this change,
  // that one is an environment limitation this change does not touch.) A real
  // deployment is always HTTPS already, so this changes nothing there.
  if (!e2eProviderMocksEnabled()) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  return response;
}

export const config = {
  /**
   * `api` is excluded outright. Every route under src/app/api is called by an
   * external service with no Supabase session — the provider webhooks and the
   * cron reconcilers — and each gates itself inside its own handler (a
   * CRON_SECRET bearer check, or signature verification plus a provider-side
   * re-fetch). Without this exclusion all of them fall into the `!user` branch
   * and get redirected to /login, so the bearer check is never even reached.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

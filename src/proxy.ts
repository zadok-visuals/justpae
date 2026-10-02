import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy` (and the exported
 * function with it). The `edge` runtime is not supported here; `proxy` always
 * runs on nodejs and that is not configurable.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
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

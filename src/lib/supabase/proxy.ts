import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database";
import { requireEnv } from "@/lib/supabase/env";

/**
 * Paths reachable without a session. Prefix-matched, so "/auth" covers
 * /auth/callback, /auth/confirm and /auth/check-email.
 *
 * "/" is checked for an EXACT match below rather than folded in here —
 * startsWith("/") matches every path and would disable auth gating entirely.
 */
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/forgot-password", "/reset-password"];

/**
 * /dev/gallery is the component gallery used for the 375px/1440px viewport
 * check. It is session-free so it can be opened without a Supabase project,
 * and it is gated TWICE: the page itself calls notFound() outside development,
 * and this list only admits it in development. Either gate alone would do; both
 * are here because a dev-only route that leaks into production is the kind of
 * thing a single flipped condition causes.
 */
const DEV_ONLY_PUBLIC_PATHS =
  process.env.NODE_ENV === "development" ? ["/dev/"] : [];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath =
    pathname === "/" ||
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    DEV_ONLY_PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database";
import { requireEnv } from "@/lib/supabase/env";
import { isProtectedPath, isPublicPath } from "@/lib/routes/access";

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
  const isPublic = isPublicPath(pathname, process.env.NODE_ENV === "development");

  // Only a route this app actually defines is worth redirecting. An unknown
  // URL falls through untouched so Next can answer its own 404 — see the long
  // note in src/lib/routes/access.ts for why that is the right trade here, and
  // for the test that stops a new protected route from being left off the list.
  if (!user && !isPublic && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // NOT a guard against "Confirm email" being off. When that project setting
  // is off, GoTrue confirms the address automatically at signUp() — so
  // email_confirmed_at is already set the moment this ever runs, and this
  // check doesn't fire. That misconfiguration is refused in signUp() itself
  // (it signs the accidental session straight back out rather than letting
  // it redirect anywhere), and the real fix is the dashboard setting staying
  // on — not this.
  //
  // What THIS actually catches: a session that is genuinely, correctly
  // pending confirmation (the normal case — signUp() or logIn() already sent
  // the account here) navigating straight to a protected route instead of
  // finishing on /auth/verify. /auth/* stays reachable — that's the only way
  // an unconfirmed user can ever get unstuck. The email itself is never put
  // in the URL; /auth/verify reads it from this same session.
  if (user && !user.email_confirmed_at && !pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/verify";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ── Phase 4: the second factor, at the routing layer ────────────────────
  //
  // NOT the gate. requireAdminUser inside every admin page and every admin
  // action is the gate, because a server action is reachable by POST whether
  // or not this ever ran, and this matcher is one edit away from not running.
  // What this adds is that an admin who signed in with a password alone never
  // SEES an admin page start to render before being bounced — the difference
  // between a clean redirect and a flash of a layout.
  //
  // /admin/security is exempt, necessarily: it is where the code is entered.
  // A non-admin who follows this redirect lands on a page whose own role check
  // sends them to /home, so the exemption leaks nothing.
  //
  // The assurance level is read from the session's own JWT claim, not from a
  // cookie or a flag the app sets — a forged `aal2` would have to be a forged
  // token.
  if (user && pathname.startsWith("/admin") && !pathname.startsWith("/admin/security")) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/security";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (user && (pathname === "/login" || pathname === "/signup" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

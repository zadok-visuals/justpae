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

  /**
   * getClaims(), not getUser(), and this is the single hottest auth call in
   * the app — it runs on every request the matcher admits, including every
   * page view by a signed-out visitor and every crawl of the landing page.
   *
   * getUser() is an HTTPS round trip to the Auth server, every time.
   * getClaims() verifies the session's JWT locally against the project's
   * JWKS. This project signs with ES256 (confirmed against
   * /auth/v1/.well-known/jwks.json, which returns an EC P-256 key), so the
   * verification is WebCrypto on a cached key set — no network call in the
   * normal case, and none at all for a signed-out request, which carries no
   * token to verify.
   *
   * WHAT IS GIVEN UP, AND WHY IT IS SAFE HERE. A JWT says what was true when
   * it was minted. A user deleted, banned, or logged out elsewhere keeps a
   * cryptographically valid token until it expires, so a claims check alone
   * would route them as though they were still signed in. That is acceptable
   * for ROUTING — which is all this does — and is not acceptable anywhere
   * else, so nowhere else relies on it:
   *
   *   - every page and layout under a protected route calls
   *     requireSessionUser() (src/lib/auth/session.ts), a real getUser(),
   *     memoised so it costs one round trip for the whole render;
   *   - every server action that moves money or changes account data does its
   *     own full getUser() before anything else;
   *   - the database enforces the rest under RLS and inside the money
   *     functions, neither of which has ever trusted this layer.
   *
   * So the worst case for a revoked-but-unexpired token is that the proxy
   * lets the request through to a layout that immediately redirects it. The
   * previous behaviour was to pay a round trip on every request — signed-out
   * ones included — to move that same redirect a few milliseconds earlier.
   */
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  const signedIn = Boolean(claims?.sub);

  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname, process.env.NODE_ENV === "development");

  // Only a route this app actually defines is worth redirecting. An unknown
  // URL falls through untouched so Next can answer its own 404 — see the long
  // note in src/lib/routes/access.ts for why that is the right trade here, and
  // for the test that stops a new protected route from being left off the list.
  if (!signedIn && !isPublic && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // THE EMAIL-CONFIRMATION FUNNEL IS NOT HERE ANY MORE, deliberately.
  //
  // It used to live in this file and read `user.email_confirmed_at` off the
  // getUser() response above. A JWT cannot answer that question: the only
  // field in the token that looks like it can is
  // `user_metadata.email_verified`, and user_metadata is writable by the user
  // through auth.updateUser() — gating on it would be gating on a value the
  // user supplies. Keeping the funnel here would therefore have meant keeping
  // the round trip, for every request, to catch a case that cannot currently
  // arise (signUp() refuses to hold an unconfirmed session, and
  // signInWithPassword() returns `email_not_confirmed` rather than a session).
  //
  // So it moved to where it can be answered honestly and once per render:
  // requireSessionUser() in src/lib/auth/session.ts, called by the dashboard,
  // onboarding and admin layouts — every protected tree has one. The
  // redirect happens before any page content is produced, which is all the
  // proxy was achieving. /auth/* stays reachable either way, which is the
  // only route by which an unconfirmed account can get unstuck.

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
  // The assurance level is read from the session's own verified JWT claim —
  // the same `aal` that getAuthenticatorAssuranceLevel() reports as
  // currentLevel, now taken straight from the claims already verified above
  // rather than by asking the client for it a second time. A forged `aal2`
  // would have to be a forged token, exactly as before.
  if (signedIn && pathname.startsWith("/admin") && !pathname.startsWith("/admin/security")) {
    if (claims?.aal !== "aal2") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/security";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (signedIn && (pathname === "/login" || pathname === "/signup" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

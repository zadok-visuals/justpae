import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolveSignoutRedirect } from "@/lib/auth/signout";

/**
 * Ends a session the Auth server has already revoked. requireSessionUser
 * (src/lib/auth/session.ts) lands here instead of /login directly, because
 * the proxy's getClaims() check can still see a JWT as valid for a session
 * getUser() just reported gone — redirecting to /login without clearing that
 * JWT would bounce straight back to /home and loop forever.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });

  // Belt and suspenders: signOut's own cookie adapter should already have
  // cleared the session cookies, but nothing downstream may rely on that
  // alone — any sb- cookie left behind is exactly what would keep getClaims()
  // reporting signed-in on the very next request.
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      cookieStore.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }

  const target = resolveSignoutRedirect(request.nextUrl.searchParams.get("next"));
  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}

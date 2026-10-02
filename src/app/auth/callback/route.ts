import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback — the PKCE code exchange, used by Google sign-in.
 *
 * Email links do NOT come through here; they go to /auth/confirm, which
 * explains why.
 *
 * New users land on /home rather than being forced into the KYC form. That is
 * safe because verification is enforced at the point of consequence, not by
 * blocking navigation: create_withdrawal_request rejects anything but an
 * approved profile regardless of which page the user reached. The KYC banner
 * on /home is what nudges them.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/home";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    console.error("[auth/callback] exchangeCodeForSession failed", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}

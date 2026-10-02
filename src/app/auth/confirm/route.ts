import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Verifies a Supabase email OTP by token hash.
 *
 * This route exists because the PKCE `code` flow — what the default
 * {{ .ConfirmationURL }} produces — only works when the browser opening the
 * link is the SAME one that made the request. The code verifier lives in that
 * browser's storage. An email link is routinely opened somewhere else: signed
 * up on a phone, confirmed from a desktop mail client, or opened in whatever
 * in-app browser the mail app embeds.
 *
 * So both the confirmation and recovery templates use {{ .TokenHash }} and
 * point here instead. See supabase/email-templates/.
 *
 * /auth/callback keeps the code exchange for OAuth, where the same-browser
 * assumption genuinely holds.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/home";

  // Only same-origin relative paths. An attacker-supplied absolute URL here
  // would turn a trusted confirmation link into an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/home";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    console.error("[auth/confirm] verifyOtp failed", { type, message: error.message });
  }

  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a cryptographically secure 6-digit OTP
function generateOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

// Build the HTML email for Resend
function buildEmailHtml(otp: string, email: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verify your justpae account</title>
</head>
<body style="margin:0;padding:0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;background-color:#020617;color:#f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#020617;padding:40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background-color:#0f172a;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
          <!-- Header Accent -->
          <tr>
            <td style="height:8px;background:linear-gradient(90deg, #f97316, #ea580c, #c2410c);"></td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding:48px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:32px;">
                    <div style="width:64px;height:64px;background:rgba(249,115,22,0.1);border-radius:20px;display:inline-block;line-height:64px;text-align:center;">
                      <span style="font-size:32px;">🔥</span>
                    </div>
                  </td>
                </tr>
              </table>

              <h1 style="margin:0;font-size:28px;font-weight:800;text-align:center;letter-spacing:-0.025em;color:#ffffff;">Verify your account</h1>
              <p style="margin:16px 0 0;font-size:16px;line-height:1.6;text-align:center;color:#94a3b8;">
                To finish creating your justpae account, please enter the following verification code:
              </p>

              <!-- OTP Display -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:40px 0;">
                <tr>
                  <td align="center">
                    <div style="background-color:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px 32px;display:inline-block;">
                      <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#f97316;font-family:'Monaco', 'Consolas', monospace;">${otp}</span>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="background-color:rgba(249,115,22,0.05);border-radius:12px;padding:16px;margin-bottom:32px;">
                <p style="margin:0;font-size:14px;color:#f97316;text-align:center;font-weight:500;">
                  ⏱ This code expires in 10 minutes
                </p>
              </div>

              <div style="padding:20px;background:rgba(255,255,255,0.02);border-radius:16px;margin-bottom:32px;">
                <h4 style="margin:0 0 8px;font-size:14px;color:#ffffff;font-weight:600;">Security Tip</h4>
                <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
                  Never share this code with anyone. justpae staff will never ask for your verification code or password via email or chat.
                </p>
              </div>

              <p style="margin:0;font-size:14px;line-height:1.6;text-align:center;color:#64748b;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px 40px;background-color:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;font-size:12px;text-align:center;color:#475569;line-height:1.8;">
                Sent to <span style="color:#94a3b8;">${email}</span><br>
                <strong>justpae Inc.</strong><br>
                123 Business Way, Suite 500<br>
                San Francisco, CA 94107<br>
                <br>
                &copy; ${new Date().getFullYear()} All rights reserved.
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Bottom Links -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;margin-top:24px;">
          <tr>
            <td align="center">
              <p style="margin:0;font-size:12px;color:#475569;">
                <a href="https://justpae.vercel.app/help" style="color:#475569;text-decoration:none;margin:0 8px;">Support</a>
                <a href="https://justpae.vercel.app/privacy" style="color:#475569;text-decoration:none;margin:0 8px;">Privacy Policy</a>
                <a href="https://justpae.vercel.app/terms" style="color:#475569;text-decoration:none;margin:0 8px;">Terms of Use</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, user_id, action } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Email service not configured. Please add RESEND_API_KEY to edge function secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use the service role client so we can write to email_verifications table and look up users
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let finalUserId = user_id;

    // If user_id is not provided, try to look it up by email
    if (!finalUserId) {
      console.log("user_id not provided, looking up user by email:", email);
      const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
      if (!userError && userData && userData.users) {
        const user = userData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (user) {
          finalUserId = user.id;
          console.log("Found user_id:", finalUserId);
        }
      }
    }

    // Invalidate any existing unused OTPs for this email
    await supabase
      .from("email_verifications")
      .delete()
      .eq("email", email.toLowerCase())
      .is("verified_at", null);

    // Generate new OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Store in DB
    const { error: dbError } = await supabase.from("email_verifications").insert({
      email: email.toLowerCase(),
      user_id: finalUserId || null,
      otp,
      expires_at: expiresAt,
    });

    if (dbError) {
      console.error("DB insert error:", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to create verification record", details: dbError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the plain text version for better deliverability
    const plainTextContent = `Your justpae verification code is: ${otp}. This code will expire in 10 minutes. If you did not request this code, please ignore this email.`;

    // Send email via Resend
    const emailPayload = {
      from: "justpae <admin@trade.justpae.app>",
      to: [email],
      subject: `${otp} is your justpae verification code`,
      html: buildEmailHtml(otp, email),
      text: plainTextContent,
    };

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", resendData);
      // Clean up the DB record since email failed
      await supabase
        .from("email_verifications")
        .delete()
        .eq("email", email.toLowerCase())
        .is("verified_at", null);

      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resendData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Verification email sent successfully to:", email, "Resend ID:", resendData.id);

    return new Response(
      JSON.stringify({ success: true, message: "Verification code sent to " + email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error in send-verification-email:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isKnownCountry } from "@/lib/countries";
import { assessPasswordStrength } from "@/lib/passwordStrength";
import {
  setPendingVerificationEmail,
  clearPendingVerificationEmail,
  resolvePendingVerificationEmail,
} from "@/lib/auth/pendingEmail";

export interface AuthActionState {
  error?: string;
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim().toUpperCase();

  if (!email || !password || !fullName || !country) {
    return { error: "All fields are required." };
  }
  if (!assessPasswordStrength(password).meetsMinimum) {
    return { error: "Password is too weak — use at least 8 characters with a mix of letters, numbers or symbols." };
  }
  if (!isKnownCountry(country)) {
    return { error: "Pick your country from the list." };
  }

  const supabase = await createClient();

  // The country goes into user metadata because handle_new_user reads it from
  // there to decide which local wallet to provision. A user who signs up
  // without it gets a USD and USDT wallet but no local one, which is a
  // confusing half-state rather than an error — hence the check above.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, country },
      emailRedirectTo: `${appUrl()}/auth/confirm?next=/onboarding/kyc`,
    },
  });

  if (error) return { error: error.message };

  if (data.session) {
    // signUp() only returns a session immediately when the Supabase
    // project's "Confirm email" setting is OFF — GoTrue skips the
    // confirmation step entirely and signs the account straight in. That is
    // a project misconfiguration, not a valid outcome: it means anyone can
    // register with an email they don't control. Refuse to use the session
    // rather than redirect a fresh signup straight into the app.
    await supabase.auth.signOut();
    console.error(
      "[signUp] Supabase 'Confirm email' is OFF: refusing to create an unverified session",
    );
    return { error: "Sign up is temporarily unavailable. Please try again shortly." };
  }

  // confirm-signup.html sends {{ .Token }} as the primary path (works by
  // being typed in, with no same-browser assumption at all) and the
  // token_hash link above as a fallback for anyone who'd rather tap than
  // type. /auth/verify collects the code; /auth/confirm still handles the
  // link for whoever uses it. Neither carries the email in a URL — see
  // pendingEmail.ts.
  await setPendingVerificationEmail(email);
  redirect("/auth/verify");
}

export interface VerifyCodeState {
  error?: string;
}

export async function verifySignupCode(
  _prevState: VerifyCodeState,
  formData: FormData,
): Promise<VerifyCodeState> {
  // Supabase's Email OTP Length is a dashboard setting (6-10 digits), not a
  // constant this app controls — hard-coding a specific length here is
  // exactly what silently truncated a valid code and turned it into a
  // "Token has expired or is invalid" error. Stripped of spaces (some mail
  // clients render the code with one) rather than relying on the client to
  // have sent it clean.
  const token = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6,10}$/.test(token)) return { error: "Enter the code from your email." };

  const supabase = await createClient();
  // Resolved server-side rather than trusted from the form — the email this
  // code is checked against is never something the client gets to supply.
  const email = await resolvePendingVerificationEmail(supabase);
  if (!email) return { error: "This verification link has expired. Go back and sign up again." };

  const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });

  if (error) {
    // GoTrue's own message ("Token has expired or is invalid") already says
    // exactly this, in clearer words than anything worth writing here.
    return { error: error.message };
  }

  await clearPendingVerificationEmail();
  redirect("/onboarding/kyc");
}

export interface ResendCodeState {
  error?: string;
  sent?: boolean;
}

export async function resendSignupCode(
  _prevState: ResendCodeState,
  formData: FormData,
): Promise<ResendCodeState> {
  // formData is unused but kept in the signature — useActionState requires
  // the action's shape to match, even for a form with nothing but a button.
  void formData;

  const supabase = await createClient();
  const email = await resolvePendingVerificationEmail(supabase);
  if (!email) return { error: "This verification link has expired. Go back and sign up again." };

  const { error } = await supabase.auth.resend({ type: "signup", email });

  if (error) return { error: error.message };
  return { sent: true };
}

export async function logIn(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      await setPendingVerificationEmail(email);
      redirect("/auth/verify");
    }
    return { error: error.message };
  }

  redirect("/home");
}

/**
 * Google sign-in. Carried over because the pre-rebuild app offered it and
 * removing a working sign-in method strands anyone already using it.
 *
 * This one legitimately uses the PKCE `code` flow through /auth/callback: the
 * OAuth round trip happens in the SAME browser that started it, so the code
 * verifier is still there. Email links are the case where that assumption
 * breaks — see /auth/confirm.
 */
export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appUrl()}/auth/callback?next=/home` },
  });

  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface ForgotPasswordState {
  error?: string;
  sent?: boolean;
}

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/confirm?next=/reset-password`,
  });

  // Reported as sent whether or not the address has an account. Surfacing the
  // difference turns this form into an account-enumeration oracle, and the
  // provider's own error here is not worth that. A genuine send failure shows
  // up in the project's auth logs.
  return { sent: true };
}

export async function resetPassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password || !assessPasswordStrength(password).meetsMinimum) {
    return { error: "Password is too weak — use at least 8 characters with a mix of letters, numbers or symbols." };
  }
  if (password !== confirmPassword) return { error: "Passwords do not match." };

  const supabase = await createClient();

  // updateUser only works against the recovery session /auth/confirm just
  // established. Without it there is nothing to update and the call fails
  // rather than silently changing the wrong account.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "This reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/login?reset=success");
}

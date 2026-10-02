"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isKnownCountry } from "@/lib/countries";

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
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
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
      emailRedirectTo: `${appUrl()}/auth/confirm?next=/home`,
    },
  });

  if (error) return { error: error.message };
  if (data.session) redirect("/home");
  redirect("/auth/check-email");
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

  if (error) return { error: error.message };
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

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
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

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
import { loginFailureValues, signupFailureValues } from "@/lib/auth/actionValues";

export interface AuthActionState {
  error?: string;
  /**
   * What the user typed, echoed back so a failed submit can re-render it.
   *
   * React 19 RESETS an uncontrolled form once its action resolves. The reset
   * restores each input to its `defaultValue`, so a form that returns only an
   * error comes back blank — someone who mistypes a password has their email
   * wiped too, and on a phone that is the difference between one correction
   * and retyping the whole thing. Returning the values and feeding them to
   * `defaultValue` makes the reset restore what they typed instead of
   * nothing.
   *
   * NEVER a password, and the type is what enforces it: there is no field
   * here to put one in. A password echoed back into an action state is a
   * secret written into the RSC payload, which is on the wire and in the
   * browser's memory for no benefit — the user has to retype it either way,
   * because a password field they cannot read is not one they can correct.
   */
  values?: {
    email?: string;
    fullName?: string;
    country?: string;
  };
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

  // Three fields echoed back on every failure; the password is not one of
  // them. Signup is the form where this matters most — it is the longest in
  // the app and the one a weak-password rejection sends you back to.
  const values = signupFailureValues({ email, fullName, country });

  if (!email || !password || !fullName || !country) {
    return { error: "All fields are required.", values };
  }
  if (!assessPasswordStrength(password).meetsMinimum) {
    return {
      error: "Password is too weak — use at least 8 characters with a mix of letters, numbers or symbols.",
      values,
    };
  }
  if (!isKnownCountry(country)) {
    return { error: "Pick your country from the list.", values };
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
      // /home, not /onboarding/kyc. A brand-new user's first screen is their
      // dashboard — balances, rates, somewhere to deposit — not a form asking
      // for a BVN before they have any reason to trust us with one.
      // Verification is offered from the Home banner, on their schedule.
      emailRedirectTo: `${appUrl()}/auth/confirm?next=/home`,
    },
  });

  if (error) return { error: error.message, values };

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
    return { error: "Sign up is temporarily unavailable. Please try again shortly.", values };
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
  // See emailRedirectTo in signUp: verification is not the first thing a new
  // user is shown. Both entry paths — typing the code and tapping the link —
  // have to agree on that, or one of them strands the user in a form.
  redirect("/home");
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

  // Every failure path below carries the email back, so the field survives the
  // React 19 form reset. The password never does — loginFailureValues takes
  // only the email, so there is nothing here that could pass one.
  const values = loginFailureValues(email);

  if (!email || !password) {
    return { error: "Email and password are required.", values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      await setPendingVerificationEmail(email);
      redirect("/auth/verify");
    }
    return { error: error.message, values };
  }

  redirect("/home");
}

// GROUP 2c removed signInWithGoogle. Sign-in is email and password only: one
// way in, so there is no "which button did I use last time" to get wrong, and
// no third party between a customer and their money. The Supabase provider
// configuration is untouched — only this app's entry point to it is gone.

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface ForgotPasswordState {
  error?: string;
  sent?: boolean;
  /** Echoed back on failure so the React 19 form reset does not blank it. */
  values?: { email?: string };
}

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address.", values: { email } };

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

/**
 * Note there is deliberately no `values` echo here: this form's only two
 * fields are the new password and its confirmation. Both are secrets, so
 * there is nothing to carry back — the user retypes either way, which is the
 * point of a password field they cannot read.
 */
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

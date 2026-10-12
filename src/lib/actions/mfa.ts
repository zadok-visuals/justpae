"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminRoleOnly, logAdminActivity } from "@/lib/auth/admin";

/**
 * TOTP second factor, for admins.
 *
 * WHY TOTP AND NOT EMAIL OR SMS CODES. The point of the second factor here is
 * that stealing the password is not enough. An emailed code is defeated by the
 * same compromised inbox that would receive the password reset, and SMS is
 * defeated by a SIM swap — which is not a theoretical attack in the markets
 * this product serves, it is the standard one. TOTP's secret never leaves the
 * authenticator app after enrolment.
 *
 * WHY SUPABASE'S OWN MFA AND NOT A HAND-ROLLED IMPLEMENTATION. Because the
 * assurance level has to be in the JWT. A home-grown check ("we saw a good
 * code, set a cookie") gives a flag the app chooses to believe; GoTrue's
 * verify() mints a token whose `aal` claim is `aal2`, which every later
 * request carries and cannot forge. That claim is what requireAdminUser reads,
 * and it is the difference between a second factor and a decoration.
 *
 * THESE ACTIONS USE requireAdminRoleOnly, not requireAdminUser. They are how a
 * session REACHES aal2, so requiring aal2 to call them would be a deadlock —
 * the one and only place in the admin surface where that substitution is
 * correct. They still require a real admin role, so this is not a public
 * enrolment endpoint.
 */

const FRIENDLY_NAME = "justpae admin";

export interface TotpEnrollment {
  factorId: string;
  /** An SVG data URI from GoTrue, rendered directly — no QR library needed. */
  qrCode: string;
  /** For typing into an authenticator by hand when the camera won't cooperate. */
  secret: string;
}

export interface MfaActionState {
  error?: string;
  ok?: boolean;
  enrollment?: TotpEnrollment;
}

/**
 * Begins enrolment and returns the QR to scan. Nothing is required of the user
 * yet; the factor is unverified and does not count as a second factor until
 * verifyTotpEnrollment succeeds (see adminMfaState, which filters to verified
 * factors for exactly this reason).
 */
export async function startTotpEnrollment(): Promise<MfaActionState> {
  await requireAdminRoleOnly();
  const supabase = await createClient();

  // An abandoned enrolment leaves an unverified factor behind, and GoTrue
  // refuses a second factor with the same friendly name — so a user who
  // reloaded the page once could never enrol again. Clear the stale ones
  // first. Only UNVERIFIED factors are touched: a verified one is somebody's
  // working second factor and must never be swept away by a page load.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: FRIENDLY_NAME,
  });

  if (error || !data) {
    console.error("[mfa.startTotpEnrollment] failed", error);
    return { error: "Couldn't start setup. Please try again." };
  }

  return {
    ok: true,
    enrollment: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    },
  };
}

/**
 * Finishes enrolment: one challenge, one verify. On success the session is
 * already aal2 — GoTrue issues the elevated token as part of verify — so there
 * is no second "now sign in again with your code" step.
 */
export async function verifyTotpEnrollment(
  _prevState: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  const actor = await requireAdminRoleOnly();
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");

  if (!factorId) return { error: "Start the setup again." };
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your app." };

  const supabase = await createClient();

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) {
    console.error("[mfa.verifyTotpEnrollment] challenge failed", challengeError);
    return { error: "Couldn't verify that code. Please try again." };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });

  if (verifyError) {
    // The provider's message is not shown: a wrong code and a clock-skew
    // failure produce different internals and the same user-facing answer.
    return { error: "That code didn't match. Check your app and try again." };
  }

  await logAdminActivity({
    adminId: actor.id,
    action: "mfa.enroll",
    targetType: "user",
    targetId: actor.id,
  });

  redirect("/admin");
}

/** The ordinary sign-in step: an enrolled admin presenting a code. */
export async function challengeTotp(
  _prevState: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  await requireAdminRoleOnly();
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");

  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your app." };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? [])[0];

  if (!factor) return { error: "No authenticator is set up on this account yet." };

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge) {
    console.error("[mfa.challengeTotp] challenge failed", challengeError);
    return { error: "Couldn't check that code. Please try again." };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code,
  });

  // Deliberately not rate-limited here: GoTrue rate-limits verify attempts on
  // its own, and a second counter in the app would be a second thing to get
  // wrong while adding nothing a determined guesser would notice.
  if (verifyError) return { error: "That code didn't match. Try the next one." };

  redirect("/admin");
}

/**
 * Removes the second factor.
 *
 * Gated on requireAdminUser (the full gate, including aal2) rather than
 * requireAdminRoleOnly — unlike everything else in this file. Taking the
 * second factor OFF an account is exactly the action a stolen aal1 session
 * would want, and allowing it at aal1 would make the whole scheme removable by
 * the attack it exists to stop. You must prove you hold the current factor to
 * drop it.
 */
export async function unenrollTotp(
  _prevState: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  // Imported lazily so this module's other actions keep their aal1 path — see
  // the module comment on why those three use the role-only gate.
  const { requireAdminUser } = await import("@/lib/auth/admin");
  const actor = await requireAdminUser();

  const factorId = String(formData.get("factorId") ?? "");
  if (!factorId) return { error: "Missing the authenticator." };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    console.error("[mfa.unenrollTotp] failed", error);
    return { error: "Couldn't remove that authenticator." };
  }

  await logAdminActivity({
    adminId: actor.id,
    action: "mfa.unenroll",
    targetType: "user",
    targetId: actor.id,
  });

  // Back to /admin/security, which will now offer enrolment: an admin with no
  // second factor cannot reach any other admin page, so sending them anywhere
  // else would just bounce.
  redirect("/admin/security");
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  kycIdFieldFor,
  kycIdPattern,
  isGovernmentIdType,
  usesBvnOrNin,
  NIGERIA_NIN_FIELD,
} from "@/lib/countries";
import { BVN_DOCUMENT_TYPE, isValidNin, maskBvn } from "@/lib/kyc/bvn";
import { verifyOwnedUpload } from "@/lib/storage/verifyUpload";
import { KYC_BUCKET } from "@/lib/kyc/constants";
import {
  KYC_ALREADY_APPROVED,
  KYC_ALREADY_IN_REVIEW,
  KYC_GENERIC_ERROR,
  describeSupabaseError,
  kycUploadMissingMessage,
  toKycError,
} from "@/lib/kyc/errors";
import {
  adminNotificationRecipients,
  sendKycSubmittedEmail,
  sendAdminBvnValidationDownEmail,
} from "@/lib/email";
import { BVN_VALIDATION_ENABLED } from "@/lib/flags";
import { validateBvn } from "@/lib/dojah/client";
import {
  resolveBvnVerification,
  precheckSaveBvn,
  precheckChangeBvn,
  BVN_DOJAH_MISMATCH_MESSAGE,
} from "@/lib/kyc/bvnFlow";
import { resolvePinError } from "@/lib/pin";
import { hasIssuedNgnVirtualAccount } from "@/lib/korapay/virtualAccount";

export interface KycActionState {
  error?: string;
}

export interface OnboardingBasicsState {
  error?: string;
}

const ACCOUNT_TYPES = new Set(["individual", "business"]);

/**
 * STAGE ONE — account type and phone number, and nothing else.
 *
 * Reached right after email confirmation, from /onboarding/kyc. It exists so a
 * new user can answer two quick questions and get to their dashboard, instead
 * of being met by a document upload before they have seen a balance.
 *
 * It deliberately does NOT touch kyc_status: nothing has been submitted, so
 * reporting "in review" would both lie to the user and put an empty row in the
 * admin queue. kyc_rejection_reason is left alone for the same reason — a
 * rejected user redoing this step needs to keep reading what went wrong.
 *
 * kyc_type is not writable from a user session (migration 0011 revoked it, and
 * a trigger raises on any end-user write), so this goes through the service
 * role with the user id from the verified session — the same shape
 * submitIndividualKyc uses. See migration 0020 for why it is not
 * submit_kyc_profile.
 */
export async function saveOnboardingBasics(
  _prevState: OnboardingBasicsState,
  formData: FormData,
): Promise<OnboardingBasicsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const accountType = String(formData.get("accountType") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();

  if (!ACCOUNT_TYPES.has(accountType)) {
    return { error: "Choose whether this is a personal or a business account." };
  }
  if (!phone) return { error: "Enter your phone number." };
  // Loose on purpose: numbers here span three dial codes and several local
  // formats, and a strict pattern rejects a valid number far more often than
  // it catches a typo. A reviewer reads this field; it is not dialled.
  if (!/^[+\d][\d\s()-]{5,19}$/.test(phone)) {
    return { error: "That doesn't look like a phone number. Include your country code." };
  }

  const kycType = accountType as "individual" | "business";

  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("save_onboarding_basics", {
      p_user_id: user.id,
      p_kyc_type: kycType,
      p_phone: phone,
    });
    if (error) throw error;

    // Written so a reviewer opening this user's documents already sees a phone
    // number beside the rest. Business has no tier split — every business
    // document, this one included, uses the single "business" tier.
    await writeKycDocuments(user.id, [
      {
        tier: kycType === "business" ? "business" : "individual_tier_1",
        document_type: "phone_number",
        value: phone,
      },
    ]);
  } catch (err) {
    console.error("[kyc.saveOnboardingBasics] failed", describeSupabaseError(err));
    // The guard in save_onboarding_basics raises P0001, which arrives as a
    // PostgrestError rather than an Error — toKycError is what reads it.
    const message = toKycError(err);
    return {
      error:
        message === KYC_GENERIC_ERROR ? "We couldn't save that. Please try again." : message,
    };
  }

  revalidatePath("/home");
  redirect("/home");
}

/**
 * FILES NO LONGER ARRIVE HERE.
 *
 * This action used to take File objects out of its own FormData and upload them
 * server-side. That failed in production for anyone using a phone: a camera
 * photo is routinely 3-8MB, Next's server-action body limit is 1MB, and the
 * request was rejected BEFORE this function ran — so every careful error
 * message below was unreachable and the user saw the framework's generic error
 * page instead. See src/lib/storage/clientUpload.ts for the full account.
 *
 * UploadField now uploads straight to the private bucket from the browser,
 * under the policy that already confines a user to their own `${userId}/…`
 * folder, and this action receives only the resulting path strings.
 *
 * Those paths are untrusted client input, so each one is re-verified before it
 * is written into a row a reviewer will open — see verifyOwnedUpload. Without
 * that check a user could submit a path into someone else's folder and have
 * that person's ID reviewed as their own.
 */
async function requireOwnedUpload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  path: string,
  documentLabel: string,
): Promise<string> {
  if (!path) throw new Error(`${documentLabel} is required.`);
  const ok = await verifyOwnedUpload(supabase, KYC_BUCKET, userId, path);
  if (!ok) throw new Error(kycUploadMissingMessage(documentLabel));
  return path;
}

type DocumentRow = {
  tier: "individual_tier_1" | "individual_tier_2" | "individual_tier_3" | "business";
  document_type: string;
  value?: string;
  file_ref?: string;
};

/**
 * THE KYC SUBMIT FAILURE, and why this is a service-role write.
 *
 * 0011 revoked table-wide UPDATE on kyc_documents and re-granted it per
 * column — `(tier, document_type, file_ref, value)`, with `user_id` left out.
 * PostgREST's upsert emits `ON CONFLICT (...) DO UPDATE SET` for EVERY column
 * in the payload, `user_id` included, and Postgres checks column UPDATE
 * privileges whether or not a conflict actually fires. So every `.upsert()` on
 * this table from a user session was rejected with 42501 before it touched a
 * row — and a PostgrestError is not an Error, so the catch below reported
 * "Something went wrong. Please try again." instead of the reason.
 *
 * The write therefore goes through the service role with the user id taken
 * from supabase.auth.getUser(), the same shape submit_kyc_profile already
 * uses. `status` is pinned to 'pending' here because the forcing trigger only
 * fires for end-user requests — the server chooses the value, never the
 * browser, and 'pending' is the only value this path may ever write.
 */
async function writeKycDocuments(userId: string, documents: DocumentRow[]): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("kyc_documents").upsert(
    documents.map((doc) => ({ ...doc, user_id: userId, status: "pending" as const })),
    { onConflict: "user_id,document_type" },
  );
  if (error) throw error;
}

export async function submitIndividualKyc(
  _prevState: KycActionState,
  formData: FormData,
): Promise<KycActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("country, phone, kyc_type, kyc_status")
    .eq("id", user.id)
    .maybeSingle();

  // Said before the uploads are re-verified, so a user whose check is already
  // running is told that rather than being walked through a failure.
  if (profile?.kyc_status === "approved") return { error: KYC_ALREADY_APPROVED };
  if (profile?.kyc_status === "pending") return { error: KYC_ALREADY_IN_REVIEW };

  // Stage one has to have happened: the phone number is collected there and
  // this form no longer asks for it. Reached only by a stale link or a crafted
  // request, since the page guard sends anyone without it back.
  if (!profile?.phone) {
    return {
      error: "Finish setting up your account first — go back to your dashboard and continue.",
    };
  }

  // Decided HERE, from the stored country — never from a client-sent value, so
  // a crafted request cannot claim to be Nigerian (or not) to choose which
  // fields get validated.
  const nigerian = usesBvnOrNin(profile.country);

  // The ID field is country-specific: a BVN or NIN for Nigeria, a Ghana Card
  // number for Ghana, a national ID for Kenya. Asking a Ghanaian for a BVN is
  // the kind of detail that makes onboarding feel built for somewhere else.
  const idField = kycIdFieldFor(profile.country);

  const fullName = String(formData.get("fullName") ?? "").trim();
  const idNumber = String(formData.get("idNumber") ?? "").trim();
  // Nigeria only, optional, and a SEPARATE number from the BVN above — not a
  // second chance at it. See NIGERIA_NIN_FIELD in src/lib/countries.ts.
  const ninNumber = String(formData.get("ninNumber") ?? "").trim();
  const idType = String(formData.get("idType") ?? "").trim();
  // Storage paths, not Files. See requireOwnedUpload above.
  const governmentIdPath = String(formData.get("governmentId") ?? "").trim();
  const proofOfAddressPath = String(formData.get("proofOfAddress") ?? "").trim();

  if (!fullName) return { error: "Enter your full name as it appears on your ID." };
  if (!idNumber) return { error: `${idField.label} is required.` };

  if (nigerian) {
    // The 11-digit check is worth running for Nigeria because a BVN is a
    // fixed-length number and a mistyped one is both a wasted review and an
    // account number the issuer will refuse to create.
    const idPattern = kycIdPattern(idField);
    if (idPattern && !idPattern.test(idNumber)) return { error: idField.hint };
    // Only when one was given. An empty optional field is not an error, but a
    // wrong one is — a NIN saved with a typo is worse than no NIN at all,
    // because a support agent will later read it as fact.
    if (ninNumber && !isValidNin(ninNumber)) return { error: NIGERIA_NIN_FIELD.hint };
  } else {
    if (!isGovernmentIdType(idType)) return { error: "Tell us which ID this is." };
    // Deliberately NO format check outside Nigeria. The country's pattern
    // describes its national ID card, and applying it to the passport number
    // the user actually entered would reject a perfectly good document. A
    // human reads this field next to the photo.
  }

  try {
    const documents: DocumentRow[] = [
      // phone_number is absent on purpose: saveOnboardingBasics already wrote
      // that row, and re-writing it here would be the only thing this action
      // did to a value it never collected.
      {
        tier: "individual_tier_2",
        document_type: nigerian ? idField.documentType : "government_id_number",
        value: idNumber,
      },
      {
        tier: "individual_tier_2",
        // Renamed from "selfie": this is a photo of a government-issued
        // document, not a face match. The old field asked for the wrong thing.
        document_type: "government_id",
        file_ref: await requireOwnedUpload(
          supabase,
          user.id,
          governmentIdPath,
          "A photo of your ID",
        ),
      },
    ];

    if (!nigerian) {
      documents.push({
        tier: "individual_tier_2",
        document_type: "government_id_type",
        value: idType,
      });
    } else if (ninNumber) {
      documents.push({
        tier: "individual_tier_2",
        document_type: NIGERIA_NIN_FIELD.documentType,
        value: ninNumber,
      });
    }

    if (proofOfAddressPath) {
      documents.push({
        tier: "individual_tier_3",
        document_type: "proof_of_address",
        file_ref: await requireOwnedUpload(
          supabase,
          user.id,
          proofOfAddressPath,
          "Proof of address",
        ),
      });
    }

    // A resubmission after rejection must REPLACE the row for a document type,
    // not add a second one beside it — otherwise a reviewer sees both the
    // rejected original and the correction with no indication which is which.
    // Status is reset to pending on every row touched, because resubmitting
    // always means "look at this again".
    await writeKycDocuments(user.id, documents);

    // Through the service role, with the user id from the verified session.
    // kyc_status, kyc_type and kyc_rejection_reason are no longer writable from
    // a user session at all — the policy that allowed it also allowed
    // kyc_status = 'approved', which is the gate every withdrawal is checked
    // against. submit_kyc_profile can only ever reach 'pending'.
    //
    // full_name matters beyond display: set_withdrawal_recipient checks the
    // payout account holder name against it, which is what blocks paying out
    // to a third party. It has to be the name on the ID.
    const admin = createAdminClient();
    const { error: profileError } = await admin.rpc("submit_kyc_profile", {
      p_user_id: user.id,
      p_kyc_type: "individual",
      p_full_name: fullName,
      // From the profile, not the form — stage one collected it and this form
      // no longer carries it. coalesce in the function means passing the same
      // value back is a no-op either way.
      p_phone: profile.phone,
    });
    if (profileError) throw profileError;

    // Tell the ops team there is something to review. Best effort and
    // deliberately after the authoritative writes: a submission that landed
    // must not be reported as failed because an email provider was down, and
    // the admin queue is the real source of truth either way.
    const admins = adminNotificationRecipients();
    if (admins.length > 0) {
      await sendKycSubmittedEmail({
        to: admins,
        userEmail: user.email ?? user.id,
        kycType: "individual",
      });
    }
  } catch (err) {
    console.error("[kyc.submitIndividualKyc] failed", describeSupabaseError(err));
    return { error: toKycError(err) };
  }

  revalidatePath("/onboarding/kyc/status");
  redirect("/onboarding/kyc/status");
}

export async function submitBusinessKyc(
  _prevState: KycActionState,
  formData: FormData,
): Promise<KycActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("kyc_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.kyc_status === "approved") return { error: KYC_ALREADY_APPROVED };
  if (profile?.kyc_status === "pending") return { error: KYC_ALREADY_IN_REVIEW };

  const businessName = String(formData.get("businessName") ?? "").trim();
  const tin = String(formData.get("tin") ?? "").trim();
  const ownershipStructure = String(formData.get("ownershipStructure") ?? "").trim();
  const certificatePath = String(formData.get("registrationCertificate") ?? "").trim();
  const directorIdPath = String(formData.get("directorId") ?? "").trim();
  const businessAddressPath = String(formData.get("proofOfBusinessAddress") ?? "").trim();

  if (!businessName || !tin) return { error: "Business name and TIN are required." };

  try {
    const documents: DocumentRow[] = [
      { tier: "business", document_type: "tin", value: tin },
      {
        tier: "business",
        document_type: "registration_certificate",
        file_ref: await requireOwnedUpload(
          supabase,
          user.id,
          certificatePath,
          "Your business registration certificate",
        ),
      },
      {
        tier: "business",
        document_type: "director_id",
        file_ref: await requireOwnedUpload(
          supabase,
          user.id,
          directorIdPath,
          "A director's ID",
        ),
      },
    ];

    if (ownershipStructure) {
      documents.push({
        tier: "business",
        document_type: "ownership_structure",
        value: ownershipStructure,
      });
    }
    if (businessAddressPath) {
      documents.push({
        tier: "business",
        document_type: "proof_of_business_address",
        file_ref: await requireOwnedUpload(
          supabase,
          user.id,
          businessAddressPath,
          "Proof of business address",
        ),
      });
    }

    await writeKycDocuments(user.id, documents);

    const admin = createAdminClient();
    const { error: profileError } = await admin.rpc("submit_kyc_profile", {
      p_user_id: user.id,
      p_kyc_type: "business",
      p_business_name: businessName,
    });
    if (profileError) throw profileError;

    // Tell the ops team there is something to review. Best effort and
    // deliberately after the authoritative writes: a submission that landed
    // must not be reported as failed because an email provider was down, and
    // the admin queue is the real source of truth either way.
    const admins = adminNotificationRecipients();
    if (admins.length > 0) {
      await sendKycSubmittedEmail({
        to: admins,
        userEmail: user.email ?? user.id,
        kycType: "business",
      });
    }
  } catch (err) {
    console.error("[kyc.submitBusinessKyc] failed", describeSupabaseError(err));
    return { error: toKycError(err) };
  }

  revalidatePath("/onboarding/kyc/status");
  redirect("/onboarding/kyc/status");
}

export interface SaveBvnState {
  error?: string;
  ok?: boolean;
  /** The saved number, already masked. Never the number itself. */
  masked?: string;
}

type BvnVerificationColumns = {
  verification_result: "matched" | "unverified" | null;
  verification_provider: string | null;
  verification_checked_at: string | null;
};

/**
 * Runs the Dojah check (when the flag is on) and turns the outcome into
 * either a refusal or the three columns to save alongside the BVN. Shared by
 * saveBvn and changeBvn so the two have exactly one definition of "verified
 * enough to save" between them.
 *
 * Alerts admins AT MOST ONCE PER COOLDOWN when Dojah does not answer —
 * claim_provider_alert (migration 0044) is the thing that makes "once"
 * true across however many saves hit the same outage.
 */
async function verifyBvnForSave(
  admin: ReturnType<typeof createAdminClient>,
  bvn: string,
  fullName: string | null | undefined,
): Promise<{ error: string } | { columns: BvnVerificationColumns }> {
  if (!BVN_VALIDATION_ENABLED) {
    return { columns: { verification_result: null, verification_provider: null, verification_checked_at: null } };
  }

  const { outcome, providerDown } = await resolveBvnVerification({
    bvn,
    fullName: fullName ?? "",
    validate: validateBvn,
  });

  if (outcome === "mismatch") return { error: BVN_DOJAH_MISMATCH_MESSAGE };

  if (providerDown) {
    console.error("[kyc.verifyBvnForSave] Dojah unavailable, saving unverified");
    const admins = adminNotificationRecipients();
    if (admins.length > 0) {
      const { data: claimed } = await admin.rpc("claim_provider_alert", { p_provider: "dojah" });
      if (claimed) await sendAdminBvnValidationDownEmail({ to: admins });
    }
  }

  return {
    columns: {
      verification_result: outcome,
      verification_provider: "dojah",
      verification_checked_at: new Date().toISOString(),
    },
  };
}

/**
 * The one-question form shown to an already-verified Nigerian user the first
 * time they open naira deposit without a BVN on file.
 *
 * WHY THIS IS NOT A KYC RESUBMISSION. Re-opening the whole identity flow would
 * reset kyc_status to pending, which would lock withdrawals and conversions
 * for someone who is already approved and did nothing wrong — a worse outcome
 * than the missing number. This writes ONE document row and touches nothing
 * else: not kyc_status, not kyc_type, not the profile.
 *
 * SECURITY SHAPE, same as every other money-adjacent action here:
 *   - the user id comes from supabase.auth.getUser(), never from the form;
 *   - the write goes through the service role, because kyc_documents rows
 *     carry a status a user session must not be able to set;
 *   - the BVN is validated server-side and is NEVER logged, NEVER returned to
 *     the browser in full, and NEVER put in a redirect. The success state
 *     carries the mask only.
 *
 * GROUP 4 — a confirm field (refused if it differs), an attempt limit of 5
 * per 24 hours, and a Dojah check ahead of saving (see verifyBvnForSave). It
 * still refuses to overwrite a BVN that is already there — that is what
 * changeBvn below is for, and it has a PIN and a lock this form does not.
 */
export async function saveBvn(
  _prevState: SaveBvnState,
  formData: FormData,
): Promise<SaveBvnState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // From the stored profile, never from the form — the same rule
  // submitIndividualKyc follows, so a crafted request cannot claim to be
  // Nigerian to reach a field its country does not have.
  const { data: profile } = await supabase
    .from("profiles")
    .select("country, kyc_status, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!usesBvnOrNin(profile?.country)) {
    return { error: "A BVN is only asked for on Nigerian accounts." };
  }
  if (profile?.kyc_status !== "approved") {
    return { error: "Finish your identity check first, then we'll ask for this." };
  }

  const bvn = String(formData.get("bvn") ?? "").trim();
  const confirmBvn = String(formData.get("confirmBvn") ?? "").trim();

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("kyc_documents")
    .select("value")
    .eq("user_id", user.id)
    .eq("document_type", BVN_DOCUMENT_TYPE)
    .maybeSingle();

  if (existing?.value) {
    // Not an error state the user can act on by trying again, so it reports
    // success with the mask rather than a refusal they would re-read as a bug.
    return { ok: true, masked: maskBvn(existing.value) };
  }

  // Recorded before the format/confirm checks: an attempt is an attempt
  // whatever is wrong with it, and this is also what stops a locked-out user
  // from probing the format checker for free.
  const { data: attemptsInWindow, error: attemptError } = await admin.rpc("record_bvn_attempt", {
    p_user_id: user.id,
  });
  if (attemptError) {
    console.error("[kyc.saveBvn] record_bvn_attempt failed", describeSupabaseError(attemptError));
    return { error: "We couldn't save that. Please try again." };
  }

  const precheck = precheckSaveBvn({ bvn, confirmBvn, attemptsInWindow: attemptsInWindow ?? 0 });
  if (!precheck.ok) return { error: precheck.error };

  const verified = await verifyBvnForSave(admin, bvn, profile?.full_name);
  if ("error" in verified) return { error: verified.error };

  const { error } = await admin.from("kyc_documents").upsert(
    {
      user_id: user.id,
      tier: "individual_tier_2" as const,
      document_type: BVN_DOCUMENT_TYPE,
      value: bvn,
      // 'approved', not 'pending': this account is already approved and a
      // reviewer has already matched the person to their documents. A pending
      // row here would put an approved user back in the review queue for a
      // number they were only asked for because the rail changed under them.
      status: "approved" as const,
      ...verified.columns,
    },
    { onConflict: "user_id,document_type" },
  );

  if (error) {
    // describeSupabaseError, never the raw error, and never the value — see
    // src/lib/kyc/bvn.ts on why this number does not go into a log line.
    console.error("[kyc.saveBvn] failed", describeSupabaseError(error));
    return { error: "We couldn't save that. Please try again." };
  }

  revalidatePath("/deposit");
  revalidatePath("/profile");
  return { ok: true, masked: maskBvn(bvn) };
}

/**
 * GROUP 4 — changing an already-saved BVN. Unlike saveBvn above, this:
 *   - requires the transaction PIN, verified the same way a withdrawal does
 *     (verify_transaction_pin), because it rewrites the number a virtual
 *     account would otherwise be issued against;
 *   - is locked out entirely once a naira virtual account has been issued —
 *     canChangeBvn / precheckChangeBvn is the rule, hasIssuedNgnVirtualAccount
 *     the read;
 *   - re-runs the same Dojah check and attempt limit saveBvn does, via the
 *     same two shared functions.
 *
 * Logged (never with the BVN itself) because it rewrites an identity number
 * on an already-approved account — exactly the kind of change that should
 * leave a trail even though it is the account owner making it, not an admin.
 */
export async function changeBvn(
  _prevState: SaveBvnState,
  formData: FormData,
): Promise<SaveBvnState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("country, kyc_status, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!usesBvnOrNin(profile?.country)) {
    return { error: "A BVN is only asked for on Nigerian accounts." };
  }

  const pin = String(formData.get("pin") ?? "");
  const bvn = String(formData.get("bvn") ?? "").trim();
  const confirmBvn = String(formData.get("confirmBvn") ?? "").trim();

  const admin = createAdminClient();

  const hasIssuedAccount = await hasIssuedNgnVirtualAccount(user.id);

  const { data: attemptsInWindow, error: attemptError } = await admin.rpc("record_bvn_attempt", {
    p_user_id: user.id,
  });
  if (attemptError) {
    console.error("[kyc.changeBvn] record_bvn_attempt failed", describeSupabaseError(attemptError));
    return { error: "We couldn't save that. Please try again." };
  }

  const precheck = precheckChangeBvn({
    pin,
    bvn,
    confirmBvn,
    hasIssuedAccount,
    attemptsInWindow: attemptsInWindow ?? 0,
  });
  if (!precheck.ok) return { error: precheck.error };

  const { error: pinError } = await admin.rpc("verify_transaction_pin", {
    p_user_id: user.id,
    p_pin: pin,
  });
  if (pinError) {
    return { error: await resolvePinError({ userId: user.id, email: user.email, error: pinError }) };
  }

  const verified = await verifyBvnForSave(admin, bvn, profile?.full_name);
  if ("error" in verified) return { error: verified.error };

  const { error } = await admin.from("kyc_documents").upsert(
    {
      user_id: user.id,
      tier: "individual_tier_2" as const,
      document_type: BVN_DOCUMENT_TYPE,
      value: bvn,
      status: "approved" as const,
      ...verified.columns,
    },
    { onConflict: "user_id,document_type" },
  );

  if (error) {
    console.error("[kyc.changeBvn] failed", describeSupabaseError(error));
    return { error: "We couldn't save that. Please try again." };
  }

  // Never the BVN itself — see the module comment on src/lib/kyc/bvn.ts.
  console.warn("[kyc.changeBvn] BVN changed", { userId: user.id });

  revalidatePath("/deposit");
  revalidatePath("/profile");
  return { ok: true, masked: maskBvn(bvn) };
}

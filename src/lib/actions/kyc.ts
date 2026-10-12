"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { kycIdFieldFor, kycIdPattern } from "@/lib/countries";
import { verifyOwnedUpload } from "@/lib/storage/verifyUpload";
import { adminNotificationRecipients, sendKycSubmittedEmail } from "@/lib/email";

export interface KycActionState {
  error?: string;
}

const KYC_BUCKET = "kyc-documents";

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
  if (!ok) {
    throw new Error(`We couldn't find your ${documentLabel.toLowerCase()}. Please upload it again.`);
  }
  return path;
}

type DocumentRow = {
  tier: "individual_tier_1" | "individual_tier_2" | "individual_tier_3" | "business";
  document_type: string;
  value?: string;
  file_ref?: string;
};

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
    .select("country")
    .eq("id", user.id)
    .maybeSingle();

  // The ID field is country-specific: a BVN for Nigeria, a Ghana Card number
  // for Ghana, a national ID for Kenya. Asking a Ghanaian for a BVN is the
  // kind of detail that makes onboarding feel built for somewhere else.
  const idField = kycIdFieldFor(profile?.country);

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const idNumber = String(formData.get("idNumber") ?? "").trim();
  // Storage paths, not Files. See requireOwnedUpload above.
  const selfiePath = String(formData.get("selfie") ?? "").trim();
  const idDocumentPath = String(formData.get("idDocument") ?? "").trim();
  const proofOfAddressPath = String(formData.get("proofOfAddress") ?? "").trim();

  if (!fullName) return { error: "Enter your full name as it appears on your ID." };
  if (!phone) return { error: "Phone number is required." };
  if (!idNumber) return { error: `${idField.label} is required.` };
  const idPattern = kycIdPattern(idField);
  if (idPattern && !idPattern.test(idNumber)) {
    return { error: idField.hint };
  }

  try {
    const documents: DocumentRow[] = [
      { tier: "individual_tier_1", document_type: "phone_number", value: phone },
      { tier: "individual_tier_2", document_type: idField.documentType, value: idNumber },
      {
        tier: "individual_tier_2",
        document_type: "selfie",
        file_ref: await requireOwnedUpload(supabase, user.id, selfiePath, "A photo of you"),
      },
      {
        tier: "individual_tier_2",
        document_type: "id_document",
        file_ref: await requireOwnedUpload(
          supabase,
          user.id,
          idDocumentPath,
          `A photo of your ${idField.label}`,
        ),
      },
    ];

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
    // `status` is deliberately NOT in this payload. The column is revoked from
    // `authenticated` (0011) and a trigger forces it to 'pending' on any write
    // from a user session — because the old payload setting it explicitly was
    // the same door a user could walk through with status: 'approved'. The
    // forced value is the one this flow wanted anyway.
    const { error: docsError } = await supabase.from("kyc_documents").upsert(
      documents.map((doc) => ({ ...doc, user_id: user.id })),
      { onConflict: "user_id,document_type" },
    );
    if (docsError) throw docsError;

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
      p_phone: phone,
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
    console.error("[kyc.submitIndividualKyc] failed", err);
    return {
      error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
    };
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

    // See submitIndividualKyc: no `status` in the payload, and the profile
    // write goes through the service role.
    const { error: docsError } = await supabase.from("kyc_documents").upsert(
      documents.map((doc) => ({ ...doc, user_id: user.id })),
      { onConflict: "user_id,document_type" },
    );
    if (docsError) throw docsError;

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
    console.error("[kyc.submitBusinessKyc] failed", err);
    return {
      error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
    };
  }

  revalidatePath("/onboarding/kyc/status");
  redirect("/onboarding/kyc/status");
}

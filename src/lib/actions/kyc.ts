"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { kycIdFieldFor, kycIdPattern } from "@/lib/countries";

export interface KycActionState {
  error?: string;
}

/** Accepted uploads. Anything else is a user mistake worth catching early. */
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function uploadKycFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File,
  prefix: string,
): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${prefix.replace(/-/g, " ")} must be under 10MB.`);
  }
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Upload a JPG, PNG, HEIC or PDF.");
  }

  // The user id is the FIRST path segment on purpose: the storage policies
  // match on storage.foldername(name)[1], so this is what confines a user to
  // their own folder.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${prefix}-${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from("kyc-documents")
    .upload(path, file, { upsert: true });
  if (error) throw error;
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
  const selfie = formData.get("selfie") as File | null;
  const idDocument = formData.get("idDocument") as File | null;
  const proofOfAddress = formData.get("proofOfAddress") as File | null;

  if (!fullName) return { error: "Enter your full name as it appears on your ID." };
  if (!phone) return { error: "Phone number is required." };
  if (!idNumber) return { error: `${idField.label} is required.` };
  const idPattern = kycIdPattern(idField);
  if (idPattern && !idPattern.test(idNumber)) {
    return { error: idField.hint };
  }
  if (!selfie || selfie.size === 0) return { error: "A selfie is required." };
  if (!idDocument || idDocument.size === 0) return { error: "A photo of your ID is required." };

  try {
    const documents: DocumentRow[] = [
      { tier: "individual_tier_1", document_type: "phone_number", value: phone },
      { tier: "individual_tier_2", document_type: idField.documentType, value: idNumber },
      {
        tier: "individual_tier_2",
        document_type: "selfie",
        file_ref: await uploadKycFile(supabase, user.id, selfie, "selfie"),
      },
      {
        tier: "individual_tier_2",
        document_type: "id_document",
        file_ref: await uploadKycFile(supabase, user.id, idDocument, "id-document"),
      },
    ];

    if (proofOfAddress && proofOfAddress.size > 0) {
      documents.push({
        tier: "individual_tier_3",
        document_type: "proof_of_address",
        file_ref: await uploadKycFile(supabase, user.id, proofOfAddress, "proof-of-address"),
      });
    }

    // A resubmission after rejection must REPLACE the row for a document type,
    // not add a second one beside it — otherwise a reviewer sees both the
    // rejected original and the correction with no indication which is which.
    // Status is reset to pending on every row touched, because resubmitting
    // always means "look at this again".
    const { error: docsError } = await supabase.from("kyc_documents").upsert(
      documents.map((doc) => ({ ...doc, user_id: user.id, status: "pending" as const })),
      { onConflict: "user_id,document_type" },
    );
    if (docsError) throw docsError;

    // full_name matters beyond display: set_withdrawal_recipient checks the
    // payout account holder name against it, which is what blocks paying out
    // to a third party. It has to be the name on the ID.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        kyc_type: "individual",
        kyc_status: "pending",
        kyc_rejection_reason: null,
      })
      .eq("id", user.id);
    if (profileError) throw profileError;
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
  const registrationCertificate = formData.get("registrationCertificate") as File | null;
  const directorId = formData.get("directorId") as File | null;
  const proofOfBusinessAddress = formData.get("proofOfBusinessAddress") as File | null;

  if (!businessName || !tin) return { error: "Business name and TIN are required." };
  if (!registrationCertificate || registrationCertificate.size === 0) {
    return { error: "Your business registration certificate is required." };
  }
  if (!directorId || directorId.size === 0) {
    return { error: "A director's ID is required." };
  }

  try {
    const documents: DocumentRow[] = [
      { tier: "business", document_type: "tin", value: tin },
      {
        tier: "business",
        document_type: "registration_certificate",
        file_ref: await uploadKycFile(
          supabase,
          user.id,
          registrationCertificate,
          "registration-certificate",
        ),
      },
      {
        tier: "business",
        document_type: "director_id",
        file_ref: await uploadKycFile(supabase, user.id, directorId, "director-id"),
      },
    ];

    if (ownershipStructure) {
      documents.push({
        tier: "business",
        document_type: "ownership_structure",
        value: ownershipStructure,
      });
    }
    if (proofOfBusinessAddress && proofOfBusinessAddress.size > 0) {
      documents.push({
        tier: "business",
        document_type: "proof_of_business_address",
        file_ref: await uploadKycFile(
          supabase,
          user.id,
          proofOfBusinessAddress,
          "proof-of-business-address",
        ),
      });
    }

    const { error: docsError } = await supabase.from("kyc_documents").upsert(
      documents.map((doc) => ({ ...doc, user_id: user.id, status: "pending" as const })),
      { onConflict: "user_id,document_type" },
    );
    if (docsError) throw docsError;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        business_name: businessName,
        kyc_type: "business",
        kyc_status: "pending",
        kyc_rejection_reason: null,
      })
      .eq("id", user.id);
    if (profileError) throw profileError;
  } catch (err) {
    console.error("[kyc.submitBusinessKyc] failed", err);
    return {
      error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
    };
  }

  revalidatePath("/onboarding/kyc/status");
  redirect("/onboarding/kyc/status");
}

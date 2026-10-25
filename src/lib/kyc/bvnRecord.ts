import { createAdminClient } from "@/lib/supabase/admin";
import { BVN_DOCUMENT_TYPE, maskBvn } from "@/lib/kyc/bvn";

/**
 * Server-only reads of the stored BVN.
 *
 * SEPARATE FROM src/lib/kyc/bvn.ts because that module is pure and is
 * imported by client components for its validation and masking helpers. This
 * one touches the service-role client and must never cross that boundary.
 *
 * SERVICE ROLE, not the user's session, even though a user can read their own
 * kyc_documents row under RLS. The caller that needs the actual number is the
 * virtual-account creator, which runs server-side on behalf of a user id
 * taken from getUser() — reading it through the same client that writes it
 * keeps "who is this for" a single question with a single answer.
 */

/** Whether this user has an unambiguous BVN saved. A legacy
 *  `nigeria_bvn_or_nin` row does NOT count — see src/lib/kyc/bvn.ts. */
export async function bvnOnFile(userId: string): Promise<{ present: boolean; masked: string | null }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("kyc_documents")
    .select("value")
    .eq("user_id", userId)
    .eq("document_type", BVN_DOCUMENT_TYPE)
    .maybeSingle();

  const value = data?.value ?? null;
  return { present: Boolean(value), masked: value ? maskBvn(value) : null };
}

/**
 * The number itself, for the one caller allowed to have it: the virtual
 * account creator, which passes it straight to the issuer.
 *
 * NAMED TO BE AWKWARD on purpose. Anything that calls this is holding a BVN
 * in memory and must not log it, return it, or put it in an error. If what
 * you need is "does this user have one", call bvnOnFile instead.
 */
export async function readBvnForProviderCall(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("kyc_documents")
    .select("value")
    .eq("user_id", userId)
    .eq("document_type", BVN_DOCUMENT_TYPE)
    .maybeSingle();
  return data?.value ?? null;
}

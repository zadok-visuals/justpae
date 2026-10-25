/**
 * KYC submission failures, named.
 *
 * Supabase errors are plain objects, not Error instances, so `err instanceof
 * Error` is false for every PostgrestError — which is how every real database
 * failure in submitIndividualKyc/submitBusinessKyc collapsed into one generic
 * "Something went wrong. Please try again." with the actual reason thrown away.
 */

export interface SupabaseErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

export const KYC_GENERIC_ERROR =
  "We couldn't send that for review. Please try again, or contact support if it keeps happening.";

export const KYC_ALREADY_IN_REVIEW =
  "Your identity check is already in review. We'll email you as soon as it's done.";

export const KYC_ALREADY_APPROVED = "Your identity is already verified — there's nothing to resend.";

export const KYC_PROFILE_INCOMPLETE =
  "Finish setting up your account first — go back to your dashboard and continue.";

export function kycUploadMissingMessage(documentLabel: string): string {
  return `We couldn't find your ${documentLabel.toLowerCase()}. Please upload it again.`;
}

function asSupabaseError(err: unknown): SupabaseErrorLike | null {
  if (typeof err !== "object" || err === null) return null;
  const candidate = err as SupabaseErrorLike;
  if (typeof candidate.message !== "string" && typeof candidate.code !== "string") return null;
  return candidate;
}

/** Everything worth having in a log line, flattened. Never shown to a user. */
export function describeSupabaseError(err: unknown): Record<string, unknown> {
  const supabase = asSupabaseError(err);
  if (supabase) {
    return {
      code: supabase.code ?? null,
      message: supabase.message ?? null,
      details: supabase.details ?? null,
      hint: supabase.hint ?? null,
    };
  }
  if (err instanceof Error) return { name: err.name, message: err.message };
  return { value: String(err) };
}

/**
 * Turns whatever was thrown into one line a customer can act on.
 *
 * Our own throws are Error instances carrying copy we wrote, so they pass
 * through. A PL/pgSQL RAISE (P0001) is also ours — submit_kyc_profile's
 * "already approved" guard is the one that reaches users — so it passes
 * through too, length-capped. Everything else is the database describing its
 * own internals and is replaced.
 */
export function toKycError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;

  const supabase = asSupabaseError(err);
  if (!supabase) return KYC_GENERIC_ERROR;

  const message = supabase.message?.trim() ?? "";

  switch (supabase.code) {
    case "P0001":
      if (/already approved/i.test(message)) return KYC_ALREADY_APPROVED;
      if (/profile not found/i.test(message)) return KYC_PROFILE_INCOMPLETE;
      return message && message.length <= 200 ? message : KYC_GENERIC_ERROR;
    case "23514":
      // kyc_documents_has_content: a row arrived with neither a file nor a
      // value, which means an upload did not land.
      return "One of your documents didn't upload properly. Please upload it again.";
    case "23503":
      return KYC_PROFILE_INCOMPLETE;
    case "23505":
      return KYC_ALREADY_IN_REVIEW;
    default:
      return KYC_GENERIC_ERROR;
  }
}

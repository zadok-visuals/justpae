import { createAdminClient } from "@/lib/supabase/admin";
import { DEPOSIT_PROOF_BUCKET } from "@/lib/deposits/proofBucket";

/**
 * Server-only. A short-lived signed URL for one manual deposit's screenshot.
 *
 * WHY THIS IS NOT IN A "use server" FILE. Every export of one is a server
 * action reachable by POST, so this function living beside the approve and
 * reject actions would be a public endpoint that signs ANY path in the bucket
 * for any signed-in user. 0037 deliberately gives the bucket no admin-side
 * select policy, on the grounds that a standing grant over every customer's
 * bank screenshots is worse than a deliberate, time-limited act — and an
 * unguarded action would hand back exactly that standing grant.
 *
 * It is therefore a plain module, called from the admin page's own render
 * (which is behind requireAdminUser) with a path read out of the database,
 * never one supplied by a browser.
 *
 * Ten minutes: long enough to work through a queue, short enough that a URL
 * pasted into a chat or left in a browser history is dead by the time anyone
 * else finds it.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function signDepositProofUrl(path: string | null): Promise<string | null> {
  if (!path) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(DEPOSIT_PROOF_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error) {
      console.error("[deposits.signDepositProofUrl] failed", { error: error.message });
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (err) {
    console.error("[deposits.signDepositProofUrl] threw", err);
    return null;
  }
}

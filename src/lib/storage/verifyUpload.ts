import type { createClient } from "@/lib/supabase/server";

/**
 * Server-only. Validates a storage path that a CLIENT uploaded to and then sent
 * through a server action.
 *
 * Moving the upload into the browser (see clientUpload.ts, and the production
 * crash it fixes) means the server no longer sees the bytes — it sees a path
 * string the client chose. That string is untrusted input, and it ends up in a
 * `kyc_documents.file_ref` that a reviewer will later open to decide whether to
 * approve someone's identity. Two things have to be true before it is written:
 *
 *   1. The path's first folder segment is the signed-in user's own id. Without
 *      this, a user could submit a path pointing into ANOTHER user's folder and
 *      have that person's ID photo reviewed as their own. The storage policy
 *      stops them WRITING there; nothing stops them REFERENCING it.
 *   2. An object actually exists at that path. Without this, a client can claim
 *      an upload that never happened and produce a submission a reviewer opens
 *      to find nothing — indistinguishable from storage having lost the file.
 *
 * Returns a boolean rather than throwing: the caller turns it into the right
 * message for whichever document failed.
 */
export async function verifyOwnedUpload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: string,
  userId: string,
  path: string,
): Promise<boolean> {
  // Also rejects "../" traversal and an absolute path, since neither can start
  // with the user's own id followed by a slash.
  if (!path.startsWith(`${userId}/`)) return false;
  if (path.includes("..")) return false;

  const lastSlash = path.lastIndexOf("/");
  const folder = path.slice(0, lastSlash);
  const fileName = path.slice(lastSlash + 1);
  if (!fileName) return false;

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder, { search: fileName, limit: 1 });

  if (error) {
    console.error("[verifyOwnedUpload] list failed", { bucket, folder, error: error.message });
    return false;
  }

  // `search` is a prefix match, so the exact name is re-checked rather than
  // trusting that a single result is the right file.
  return Boolean(data?.some((f) => f.name === fileName));
}

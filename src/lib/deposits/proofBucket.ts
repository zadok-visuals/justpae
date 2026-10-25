/**
 * The private bucket manual-deposit screenshots go into (migration 0037).
 *
 * Its own module because the name is needed by a client component (the upload
 * field), a server action (the ownership check) and a server module (the
 * signed URL) — and a `"use server"` file cannot export a constant to a
 * client component, since every export of one must be an async function.
 */
export const DEPOSIT_PROOF_BUCKET = "deposit-proof";

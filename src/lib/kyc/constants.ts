/**
 * Shared between the KYC server actions, the upload fields, and the admin
 * reviewer — in a plain module because a `"use server"` file may only export
 * async functions (Next.js treats every export as a callable server action).
 *
 * The literal was written out three times before this: once in the server
 * action that verifies an upload, once in the client form that performs it,
 * and about to be a third time in the admin screen that reads it back. Three
 * copies of a bucket name is three chances for a rename to leave one behind,
 * and the one left behind fails at runtime against a private bucket.
 */
export const KYC_BUCKET = "kyc-documents";

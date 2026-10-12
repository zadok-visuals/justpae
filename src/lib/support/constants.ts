/**
 * Shared between the support server actions and the client chat component, so
 * in a plain module: a `"use server"` file may only export async functions
 * (Next.js treats every export as a callable server action), and a
 * `"use client"` one would pull this into the browser bundle unnecessarily
 * when the server imports it.
 */

/** The private bucket. Size and MIME limits are enforced by Storage itself —
 *  see supabase/migrations/0017 — so a client that skips the checks below
 *  still cannot upload a 50MB PDF. */
export const SUPPORT_BUCKET = "support-attachments";

/** Mirrors the bucket's own allowed_mime_types. */
export const SUPPORT_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Mirrors the bucket's own file_size_limit (5MB). */
export const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export const SUPPORT_MESSAGE_MAX_LENGTH = 4000;

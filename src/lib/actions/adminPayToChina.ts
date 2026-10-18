"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { toRpcError } from "@/lib/provider-error";
import { notifyPayToChinaStatus } from "@/lib/notify/events";

/**
 * The Pay to China queue's write side.
 *
 * Three actions, one shape: gate on an aal2 admin, call one SQL function that
 * does the whole state change atomically, then tell the customer.
 *
 * WHY THE LEDGER ENTRY IS NOT WRITTEN HERE. Every other admin action in this
 * app logs from the action layer, because several of them are plain table
 * writes with no function to put it in. These three have one — and the log
 * line goes INSIDE it, in the same transaction as the state change (see
 * migration 0026). "It was marked complete but nobody knows who by" is then
 * not a thing that can happen, rather than a thing that happens when the log
 * call fails.
 *
 * WHY THE REFUND IS NOT HERE EITHER. admin_reject_pay_to_china credits the
 * wallet in the same transaction as the rejection. A refund that is a second
 * step is a refund somebody eventually forgets, and the customer finds out by
 * noticing.
 */

export interface AdminPayToChinaState {
  error?: string;
  ok?: boolean;
  /** Echoed back so a failed reject can refill the textarea. */
  values?: { reason?: string };
}

function revalidateQueue() {
  revalidatePath("/admin/pay-to-china");
  revalidatePath("/admin");
}

export async function startPayToChina(
  _prev: AdminPayToChinaState,
  formData: FormData,
): Promise<AdminPayToChinaState> {
  const actor = await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) return { error: "Missing request." };

  const service = createAdminClient();
  const { error } = await service.rpc("admin_start_pay_to_china", {
    p_transaction_id: transactionId,
    p_admin_id: actor.id,
  });
  if (error) return { error: toRpcError(error, "pay to China") };

  await notifyPayToChinaStatus(transactionId, "processing");
  revalidateQueue();
  return { ok: true };
}

export async function completePayToChina(
  _prev: AdminPayToChinaState,
  formData: FormData,
): Promise<AdminPayToChinaState> {
  const actor = await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");
  const actualCny = Number(formData.get("actualCny"));
  const note = String(formData.get("note") ?? "").trim() || null;
  // Uploaded straight to the private bucket from the admin's browser through
  // a signed URL — see createPayToChinaProofUploadUrl below for why the admin
  // cannot write there through RLS.
  const proofRef = String(formData.get("proofRef") ?? "").trim() || null;

  if (!transactionId) return { error: "Missing request." };
  if (!Number.isFinite(actualCny) || actualCny <= 0) {
    return { error: "Enter the CNY amount that was actually delivered." };
  }

  const service = createAdminClient();
  const { error } = await service.rpc("admin_complete_pay_to_china", {
    p_transaction_id: transactionId,
    p_admin_id: actor.id,
    p_actual_cny: actualCny,
    p_proof_ref: proofRef,
    p_note: note,
  });
  if (error) return { error: toRpcError(error, "pay to China") };

  await notifyPayToChinaStatus(transactionId, "completed");
  revalidateQueue();
  return { ok: true };
}

export async function rejectPayToChina(
  _prev: AdminPayToChinaState,
  formData: FormData,
): Promise<AdminPayToChinaState> {
  const actor = await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!transactionId) return { error: "Missing request." };
  if (!reason) {
    // The customer reads this. "Rejected" with no reason guarantees they
    // resubmit exactly the same thing.
    return { error: "Tell the customer why — they see this.", values: { reason } };
  }

  const service = createAdminClient();
  const { error } = await service.rpc("admin_reject_pay_to_china", {
    p_transaction_id: transactionId,
    p_admin_id: actor.id,
    p_reason: reason,
  });
  if (error) return { error: toRpcError(error, "pay to China"), values: { reason } };

  await notifyPayToChinaStatus(transactionId, "rejected", { reason });
  revalidateQueue();
  return { ok: true };
}

/**
 * A one-shot upload URL for the payment receipt.
 *
 * The proof lives in the CUSTOMER's folder, so they can read it — which means
 * the admin is never the folder owner and there is no RLS path for them to
 * write there at all (0026 deliberately gives that bucket no insert policy).
 * A signed upload URL minted with the service role is the only way in, and it
 * bypasses RLS by design.
 *
 * Returns the path too, because that is what goes on the transaction row and
 * the browser has no other way to know it.
 */
export async function createPayToChinaProofUploadUrl(
  transactionId: string,
): Promise<{ url?: string; token?: string; path?: string; error?: string }> {
  await requireAdminUser();

  const service = createAdminClient();
  const { data: tx } = await service
    .from("transactions")
    .select("user_id, type")
    .eq("id", transactionId)
    .maybeSingle();

  if (!tx || tx.type !== "pay_to_china") return { error: "Request not found." };

  // The folder is the customer's id, so the proof sits beside everything else
  // that belongs to them and their own read policy reaches it.
  const path = `${tx.user_id}/${transactionId}-${Date.now()}.jpg`;
  const { data, error } = await service.storage
    .from("pay-to-china-proof")
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("[adminPayToChina] signed upload URL failed", { transactionId, error });
    return { error: "Could not prepare the upload. Please try again." };
  }

  return { url: data.signedUrl, token: data.token, path };
}

/**
 * A signed URL to LOOK at something in a private bucket — the customer's QR
 * code, or a proof already uploaded.
 *
 * Minted per view and short-lived. The admin has no RLS path into either
 * bucket, which is correct: their access is a consequence of being an admin
 * at this moment, not a standing permission attached to a URL somebody could
 * keep.
 */
export async function signPayToChinaAsset(
  bucket: "pay-to-china-qr" | "pay-to-china-proof",
  path: string,
): Promise<{ url?: string; error?: string }> {
  await requireAdminUser();

  const service = createAdminClient();
  const { data, error } = await service.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data) return { error: "Could not open that file." };
  return { url: data.signedUrl };
}

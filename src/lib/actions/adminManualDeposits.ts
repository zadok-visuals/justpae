"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser, logAdminActivity } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { toRpcError } from "@/lib/provider-error";
import { notifyDepositCredited, notifyManualDepositRejected } from "@/lib/notify/events";
import { SETTING_KEYS } from "@/lib/settings";
import { MANUAL_DEPOSIT_DEFAULTS } from "@/lib/deposits/manualDeposit";

/**
 * The admin side of manual NGN bank-transfer deposits.
 *
 * EVERY function here starts with requireAdminUser(). A server action is
 * reachable by POST whether or not the page that rendered its form was gated,
 * so this is the only gate that actually exists — the same rule actions/
 * admin.ts states, and it matters more here than anywhere else in the product
 * because approving one of these credits a wallet from a human's judgement
 * rather than from a provider's confirmation.
 *
 * THE CREDITED AMOUNT COMES FROM THIS FORM AND NOWHERE ELSE. p_received_amount
 * is read out of the admin's own submitted field, server-side, and p_admin_id
 * comes from requireAdminUser() — which is getUser() — never from a hidden
 * input. A hidden field carrying either of them would turn the one control
 * this rail has into a number the browser chooses.
 *
 * The dual-admin rule for >= 1,000,000 NGN lives inside
 * approve_manual_deposit, under the same row lock as the credit. Nothing here
 * enforces it and nothing here could: a disabled button is not a control.
 */

export interface ManualDepositActionState {
  error?: string;
  ok?: boolean;
  /** Distinct per outcome — see approveManualDeposit. */
  message?: string;
  /** Echoed back so a rejected submission does not blank what was typed. */
  values?: { depositId?: string; receivedAmount?: string; reason?: string };
}

/**
 * Approve, and surface which of the four things actually happened.
 *
 * approve_manual_deposit returns a word rather than a boolean because the four
 * outcomes need four different things from the admin, and collapsing them into
 * "done"/"not done" is how an admin re-presses Approve on a deposit a
 * colleague already credited.
 */
export async function approveManualDeposit(
  _prevState: ManualDepositActionState,
  formData: FormData,
): Promise<ManualDepositActionState> {
  const actor = await requireAdminUser();

  const depositId = String(formData.get("depositId") ?? "");
  const rawReceived = String(formData.get("receivedAmount") ?? "").replace(/,/g, "").trim();
  const values = { depositId, receivedAmount: rawReceived };

  if (!depositId) return { error: "Missing deposit.", values };

  const receivedAmount = Number(rawReceived);
  if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) {
    return { error: "Enter the amount that actually arrived.", values };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("approve_manual_deposit", {
    p_deposit_id: depositId,
    p_admin_id: actor.id,
    p_received_amount: receivedAmount,
  });

  // The function raises only on a refusal the admin must act on — the same
  // admin trying to be both signatures, or a second signature for a different
  // figure. Those messages are written to be read, so they are shown.
  if (error) return { error: toRpcError(error, "admin"), values };

  await logAdminActivity({
    adminId: actor.id,
    action: "deposit.manual.approve",
    targetType: "deposit",
    targetId: depositId,
    detail: { receivedAmount, outcome: data },
  });

  revalidatePath("/admin/deposits");

  switch (data) {
    case "credited":
      // Only this branch moved money, so only this branch tells the customer.
      await notifyDepositCredited(depositId);
      return { ok: true, message: "Credited. The customer has been told.", values };

    case "awaiting_second_approval":
      return {
        ok: true,
        message:
          "Recorded as the first approval. A second, different admin has to agree the same " +
          "figure before anything is credited.",
        values,
      };

    case "already_credited":
      return {
        ok: true,
        message: "Another admin already credited this one. Nothing changed.",
        values,
      };

    case "not_reviewable":
      return {
        error:
          "This deposit isn't waiting on a review — the customer hasn't marked it as sent, or " +
          "it has already been closed.",
        values,
      };

    default:
      console.error("[adminManualDeposits.approve] unexpected outcome", { depositId, data });
      return { error: "That didn't complete. Check the deposit before trying again.", values };
  }
}

export async function rejectManualDeposit(
  _prevState: ManualDepositActionState,
  formData: FormData,
): Promise<ManualDepositActionState> {
  const actor = await requireAdminUser();

  const depositId = String(formData.get("depositId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const values = { depositId, reason };

  if (!depositId) return { error: "Missing deposit.", values };
  // Required here rather than in the function, so the admin gets a form error
  // instead of an exception — and because the customer reads this sentence.
  if (reason.length < 4) {
    return { error: "Say why. The customer reads this.", values };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reject_manual_deposit", {
    p_deposit_id: depositId,
    p_admin_id: actor.id,
    p_reason: reason,
  });

  if (error) return { error: toRpcError(error, "admin"), values };
  if (data !== true) {
    return { error: "This deposit isn't waiting on a review any more.", values };
  }

  await logAdminActivity({
    adminId: actor.id,
    action: "deposit.manual.reject",
    targetType: "deposit",
    targetId: depositId,
    detail: { reason },
  });

  await notifyManualDepositRejected(depositId, reason);

  revalidatePath("/admin/deposits");
  return { ok: true, message: "Rejected. The customer has been told why.", values };
}

/**
 * The receiving account, saved as one object.
 *
 * NOT setAppSetting, which validates every value as a number — two of these
 * three are text. And one form rather than three, unlike the payout settings:
 * a bank name without its account number is not a half-saved preference, it
 * is an instruction telling somebody to send money to an incomplete address.
 */
export async function setManualDepositAccount(
  _prevState: ManualDepositActionState,
  formData: FormData,
): Promise<ManualDepositActionState> {
  const actor = await requireAdminUser();

  const bankName = String(formData.get("bankName") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const accountName = String(formData.get("accountName") ?? "").trim();

  if (!bankName || !accountNumber || !accountName) {
    return { error: "All three are needed before customers can be shown an account." };
  }
  // Nigerian NUBAN is 10 digits. Checked because a typo here sends a
  // customer's money to a stranger, and nothing downstream can catch it.
  if (!/^\d{10}$/.test(accountNumber)) {
    return { error: "A Nigerian account number is 10 digits." };
  }

  const admin = createAdminClient();
  for (const [key, value] of [
    [SETTING_KEYS.manualDepositBankName, bankName],
    [SETTING_KEYS.manualDepositAccountNumber, accountNumber],
    [SETTING_KEYS.manualDepositAccountName, accountName],
  ] as const) {
    const { error } = await admin.rpc("admin_set_setting", {
      p_key: key,
      p_value: value,
      p_set_by: actor.id,
    });
    if (error) return { error: toRpcError(error, "admin") };
  }

  await logAdminActivity({
    adminId: actor.id,
    action: "setting.manual_deposit_account",
    targetType: "setting",
    targetId: SETTING_KEYS.manualDepositAccountNumber,
    detail: { bankName, accountNumber, accountName },
  });

  revalidatePath("/admin/rates");
  return { ok: true, message: "Saved. Customers will be shown this account." };
}

/** The minimum, the maximum and the optional flat fee. */
export async function setManualDepositLimits(
  _prevState: ManualDepositActionState,
  formData: FormData,
): Promise<ManualDepositActionState> {
  const actor = await requireAdminUser();

  const min = Number(String(formData.get("minAmount") ?? "").replace(/,/g, ""));
  const max = Number(String(formData.get("maxAmount") ?? "").replace(/,/g, ""));
  const fee = Number(String(formData.get("fee") ?? "").replace(/,/g, ""));

  if (![min, max, fee].every((n) => Number.isFinite(n) && n >= 0)) {
    return { error: "Enter valid amounts." };
  }
  if (min <= 0) return { error: "The minimum has to be greater than zero." };
  if (max <= min) return { error: "The maximum has to be above the minimum." };
  // A fee that can swallow the smallest accepted deposit is a deposit that
  // credits nothing — approve_manual_deposit refuses it, after the customer
  // has already sent the money.
  if (fee >= min) return { error: "The fee has to be below the minimum deposit." };

  const admin = createAdminClient();
  for (const [key, value] of [
    [SETTING_KEYS.manualDepositMinNgn, min],
    [SETTING_KEYS.manualDepositMaxNgn, max],
    [SETTING_KEYS.manualDepositFeeNgn, fee],
  ] as const) {
    const { error } = await admin.rpc("admin_set_setting", {
      p_key: key,
      p_value: String(value),
      p_set_by: actor.id,
    });
    if (error) return { error: toRpcError(error, "admin") };
  }

  await logAdminActivity({
    adminId: actor.id,
    action: "setting.manual_deposit_limits",
    targetType: "setting",
    targetId: SETTING_KEYS.manualDepositMinNgn,
    detail: { min, max, fee, defaults: MANUAL_DEPOSIT_DEFAULTS },
  });

  revalidatePath("/admin/rates");
  return { ok: true, message: "Saved." };
}

// The screenshot's signed URL is minted in src/lib/deposits/proofUrl.ts, NOT
// here. Every export of a "use server" file is a server action reachable by
// POST, so a `signProofUrl(path)` living in this module would be a public
// endpoint that signs any path in the bucket for any signed-in user — the
// exact standing grant over every customer's uploads that 0037 refused to
// create as an RLS policy.

"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import { SETTING_KEYS } from "@/lib/settings";
import { isCurrency } from "@/lib/currencies";

/**
 * Admin actions.
 *
 * EVERY function here starts with requireAdminUser(). That is not belt-and-
 * braces on top of a gated page — a server action is reachable by POST whether
 * or not the page rendering its form was gated, so this is the only gate that
 * actually exists. Omitting it on one action makes that action public.
 */

export interface AdminActionState {
  error?: string;
  ok?: boolean;
}

export async function approveKyc(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_approve_kyc", { p_user_id: userId });

  if (error) return { error: error.message };
  revalidatePath("/admin/kyc");
  return { ok: true };
}

export async function rejectKyc(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  // Required, not optional. Without it the user's status page can only say
  // "please review and resubmit", which tells them nothing and all but
  // guarantees a second rejection for the same reason.
  if (!reason) return { error: "A rejection reason is required." };

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_reject_kyc", {
    p_user_id: userId,
    p_reason: reason,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/kyc");
  return { ok: true };
}

export async function completeWithdrawal(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_complete_withdrawal", {
    p_transaction_id: transactionId,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/withdrawals");
  return { ok: true };
}

export async function rejectWithdrawal(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  const admin = createAdminClient();
  // This refunds the wallet. An admin rejection must not strand a debited
  // withdrawal any more than a provider failure may.
  const { error } = await admin.rpc("admin_reject_withdrawal", {
    p_transaction_id: transactionId,
    p_reason: reason || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/withdrawals");
  return { ok: true };
}

/**
 * Records that an above-threshold withdrawal's extra verification happened.
 *
 * The verification MECHANISM is deliberately not built: whether it is a
 * re-uploaded ID, a video call or an OTP is an operational decision nobody has
 * made yet. This gates the payout on a human confirming it happened
 * out-of-band, which is honest, rather than implementing a fake check that
 * looks like verification and verifies nothing.
 */
export async function confirmWithdrawalVerification(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const adminUser = await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_confirm_withdrawal_verification", {
    p_transaction_id: transactionId,
    p_admin_id: adminUser.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/withdrawals");
  return { ok: true };
}

/** Sets the markup for one ordered pair. Entered as a percentage. */
export async function setRateMarkup(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const adminUser = await requireAdminUser();

  // Submitted as a single "BASE/QUOTE" value from one select — simpler than
  // two dropdowns that can be set to the same currency.
  const [base, quote] = String(formData.get("pair") ?? "").split("/");
  const markupPercent = Number(formData.get("markupPercent"));

  if (!base || !quote || !isCurrency(base) || !isCurrency(quote)) {
    return { error: "Select a currency pair." };
  }
  if (base === quote) return { error: "Base and quote currency must differ." };
  if (!Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent >= 100) {
    return { error: "Enter a markup between 0 and 99.99 percent." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_rate_markup", {
    p_base_currency: base as Currency,
    p_quote_currency: quote as Currency,
    // Stored as a fraction. The form takes a percentage because that is how an
    // operator thinks about a spread; the conversion happens once, here.
    p_markup_rate: markupPercent / 100,
    p_set_by: adminUser.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/rates");
  revalidatePath("/convert");
  return { ok: true };
}

/**
 * Sets the operator-tunable settings. These were hardcoded constants; the
 * automation threshold in particular was a literal buried three files from any
 * admin surface, so changing the risk appetite of the payout system needed a
 * deploy.
 */
export async function setAppSetting(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const adminUser = await requireAdminUser();
  const key = String(formData.get("key") ?? "");
  const rawValue = String(formData.get("value") ?? "").trim();

  const allowed = Object.values(SETTING_KEYS) as string[];
  if (!allowed.includes(key)) return { error: "Unknown setting." };

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) return { error: "Enter a valid number." };

  // Per-setting sanity bounds. A fee rate typed as "5" meaning 5% would be
  // stored as 500%, and a zero threshold would route every withdrawal to
  // manual review — both are easy slips with expensive consequences.
  if (key === SETTING_KEYS.withdrawalFeeRate && value >= 1) {
    return { error: "The fee rate is a fraction, e.g. 0.01 for 1%." };
  }
  if (key === SETTING_KEYS.automatedPayoutWindowHours && (value < 1 || value > 168)) {
    return { error: "The window must be between 1 and 168 hours." };
  }
  if (key === SETTING_KEYS.automatedPayoutThresholdUsd && value <= 0) {
    return { error: "The threshold must be greater than zero." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_setting", {
    p_key: key,
    p_value: String(value),
    p_set_by: adminUser.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/rates");
  return { ok: true };
}

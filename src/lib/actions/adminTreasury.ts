"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser, logAdminActivity } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { toRpcError } from "@/lib/provider-error";
import { resolveBankAccount } from "@/lib/korapay/client";
import { getSweepSettings, SETTING_KEYS } from "@/lib/settings";
import { sweepDeps } from "@/lib/treasury/deps";
import { runSweep } from "@/lib/treasury/run";
import { KORAPAY_AUTO_SWEEP } from "@/lib/flags";
import { isCurrency, formatAmount } from "@/lib/currencies";

/**
 * The admin side of the treasury.
 *
 * requireAdminUser() first in every function — and that gate already demands
 * aal2, so "changing the sweep account requires an admin with MFA" is not a
 * check added here, it is the gate every admin action already passes. What
 * this file adds is the two consequences of that particular change: it is
 * written to the activity ledger, and admin_set_sweep_account pauses the
 * sweep for 24 hours inside the same statement that stores the destination.
 *
 * NO AMOUNT IN HERE MOVES A CUSTOMER BALANCE. record_treasury_movement
 * writes to its own table and touches no wallet, which is asserted in
 * migration 0042's behavioural checks rather than only stated.
 */

export interface TreasuryActionState {
  error?: string;
  ok?: boolean;
  message?: string;
}

/** A positive money amount from a form field, or null. */
function parseAmount(raw: string): number | null {
  const value = Number(raw.replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Record a transfer somebody made by hand.
 *
 * The reference is the operator's own — their bank's, usually — because this
 * row exists to be matched against a statement later. It is unique in the
 * database, so recording the same transfer twice is refused rather than
 * double-counted in the treasury total.
 */
export async function recordTreasuryMovement(
  _prevState: TreasuryActionState,
  formData: FormData,
): Promise<TreasuryActionState> {
  const actor = await requireAdminUser();

  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  if (!isCurrency(currency)) return { error: "Pick a currency." };

  const amount = parseAmount(String(formData.get("amount") ?? ""));
  if (amount == null) return { error: "Enter an amount above zero." };

  const fromAccount = String(formData.get("fromAccount") ?? "").trim();
  const toAccount = String(formData.get("toAccount") ?? "").trim();
  if (!fromAccount || !toAccount) return { error: "Say where the money came from and went to." };

  const reference = String(formData.get("reference") ?? "").trim();
  if (!reference) return { error: "A movement needs a reference to match it to a statement." };

  const occurredOn = String(formData.get("occurredOn") ?? "").trim();
  if (occurredOn && !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return { error: "Enter the date as YYYY-MM-DD." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_treasury_movement", {
    p_currency: currency,
    p_amount: amount,
    p_from_account: fromAccount,
    p_to_account: toAccount,
    p_reference: reference,
    p_source: "manual",
    p_occurred_on: occurredOn || null,
    p_note: String(formData.get("note") ?? "").trim() || null,
    p_created_by: actor.id,
  });

  if (error) return { error: toRpcError(error, "admin") };
  // `.id`, not the row itself. A plpgsql function returning a composite type
  // hands back a row of NULLs rather than NULL when its insert wrote nothing,
  // and over PostgREST that arrives as an object — truthy, and wrong.
  if (!data?.id) return { error: "A movement with that reference is already recorded." };

  await logAdminActivity({
    adminId: actor.id,
    action: "treasury.movement_recorded",
    targetType: "treasury_movement",
    targetId: data.id,
    detail: { currency, amount, fromAccount, toAccount, reference },
  });

  revalidatePath("/admin/treasury");
  return { ok: true, message: `Recorded ${formatAmount(currency, amount)}.` };
}

/**
 * Change where the sweep sends.
 *
 * THE NAME IS NOT TYPED, IT IS RESOLVED. The admin supplies a bank code and
 * an account number; the name stored is whatever the bank returns for that
 * pair. A destination whose name somebody typed is a destination nobody
 * checked, and this is the account the company's own money is sent to
 * unattended.
 */
export async function setSweepAccount(
  _prevState: TreasuryActionState,
  formData: FormData,
): Promise<TreasuryActionState> {
  const actor = await requireAdminUser();

  const bankCode = String(formData.get("bankCode") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  if (!bankCode || !accountNumber) return { error: "Enter a bank code and an account number." };

  let accountName: string;
  try {
    const resolved = await resolveBankAccount({ bankCode, accountNumber });
    accountName = (resolved.account_name ?? "").trim();
  } catch (err) {
    console.error("[adminTreasury.setSweepAccount] could not resolve the account", {
      bankCode,
      error: err instanceof Error ? err.message : err,
    });
    return { error: "That account could not be confirmed with the bank. Check the details." };
  }
  if (!accountName) return { error: "The bank returned no name for that account." };

  const admin = createAdminClient();
  const { data: pausedUntil, error } = await admin.rpc("admin_set_sweep_account", {
    p_bank_code: bankCode,
    p_account_number: accountNumber,
    p_account_name: accountName,
    p_admin_id: actor.id,
  });
  if (error) return { error: toRpcError(error, "admin") };

  await logAdminActivity({
    adminId: actor.id,
    action: "treasury.sweep_account_changed",
    targetType: "setting",
    targetId: SETTING_KEYS.sweepFundingAccountNumber,
    detail: { bankCode, accountNumber, accountName, pausedUntil },
  });

  revalidatePath("/admin/treasury");
  return {
    ok: true,
    message: `Saved as "${accountName}". The sweep is paused for 24 hours.`,
  };
}

/** One of the three numeric sweep dials. */
export async function setSweepSetting(
  _prevState: TreasuryActionState,
  formData: FormData,
): Promise<TreasuryActionState> {
  const actor = await requireAdminUser();

  const key = String(formData.get("key") ?? "");
  const allowed: string[] = [
    SETTING_KEYS.sweepMinKeepNgn,
    SETTING_KEYS.sweepTargetPayoutNgn,
    SETTING_KEYS.sweepMaxDailyNgn,
    SETTING_KEYS.sweepTimeLagos,
  ];
  if (!allowed.includes(key)) return { error: "That setting cannot be changed here." };

  const raw = String(formData.get("value") ?? "").trim();
  let value: string;
  if (key === SETTING_KEYS.sweepTimeLagos) {
    if (!/^\d{1,2}:\d{2}$/.test(raw)) return { error: "Enter the time as HH:MM." };
    value = raw;
  } else {
    const parsed = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed < 0) return { error: "Enter a number above zero." };
    value = String(parsed);
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_setting", {
    p_key: key,
    p_value: value,
    p_set_by: actor.id,
  });
  if (error) return { error: toRpcError(error, "admin") };

  await logAdminActivity({
    adminId: actor.id,
    action: "setting.sweep",
    targetType: "setting",
    targetId: key,
    detail: { value },
  });

  revalidatePath("/admin/treasury");
  return { ok: true, message: "Saved." };
}

/** The "Sweep now" button. Same rules as the cron, minus the clock. */
export async function sweepNow(
  _prevState: TreasuryActionState,
  formData: FormData,
): Promise<TreasuryActionState> {
  const actor = await requireAdminUser();
  // The button submits nothing and nothing here reads it: the amount, the
  // destination and the caps all come from settings, so there is no field a
  // crafted POST could use to move more than the dials allow.
  void formData;

  const settings = await getSweepSettings();
  const admin = createAdminClient();
  const result = await runSweep(sweepDeps(admin, settings, "treasury sweep (manual)"), {
    settings,
    flagEnabled: KORAPAY_AUTO_SWEEP,
    manual: true,
    adminId: actor.id,
  });

  await logAdminActivity({
    adminId: actor.id,
    action: "treasury.sweep_now",
    targetType: "treasury_movement",
    detail: { ...result },
  });

  revalidatePath("/admin/treasury");

  if (!result.swept) {
    const why: Record<string, string> = {
      flag_off: "The sweep is switched off for this deployment.",
      paused: "The sweep is paused — the destination was changed in the last 24 hours.",
      no_destination: "Set the funding account first.",
      not_yet_today: "It is not sweep time yet.",
      nothing_to_move: "Nothing to move: the balances are already where the settings want them.",
      already_swept: "That sweep is already recorded.",
      send_failed: "The transfer was refused. The movement is recorded as failed.",
    };
    return { error: why[result.reason] ?? "The sweep did not run." };
  }

  return { ok: true, message: `Swept ${formatAmount("NGN", result.amount)}.` };
}

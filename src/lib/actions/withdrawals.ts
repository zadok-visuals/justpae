"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Currency } from "@/lib/types/database";
import { attemptAutomatedPayout } from "@/lib/withdrawals/automated-payout";
import { evaluateWithdrawalRouting, usdEquivalent } from "@/lib/withdrawals/threshold";
import { getBanks } from "@/lib/busha/client";
import { MINIMUM_WITHDRAWAL_USDT_THRESHOLD } from "@/lib/busha/limits";
import { toCustomerError } from "@/lib/provider-error";

export interface WithdrawalActionState {
  error?: string;
  ok?: boolean;
}

/**
 * Per-currency recipient field rules, shared by first-time setup and the
 * re-verified change flow — the requiredness is identical either way, only the
 * RPC and the gate in front of it differ.
 *
 * The corridor shapes: NGN and GHS are bank accounts, KES is an M-Pesa phone
 * number (stored in bank_account_number, which is the destination identifier
 * for whatever the corridor's rail is rather than strictly a bank account),
 * USDT is a wallet address on BSC.
 */
async function parseRecipientFields(
  currency: Currency,
  formData: FormData,
): Promise<
  | { error: string }
  | {
      accountHolderName: string;
      bankAccountNumber: string | null;
      bankName: string | null;
      walletAddress: string | null;
      bankCode: string | null;
      network: string | null;
    }
> {
  const accountHolderName = String(formData.get("accountHolderName") ?? "").trim();
  const bankAccountNumber = String(formData.get("bankAccountNumber") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();
  const bankCode = String(formData.get("bankCode") ?? "").trim();
  const walletAddress = String(formData.get("walletAddress") ?? "").trim();

  if (!accountHolderName) return { error: "Account holder name is required." };

  if (currency === "USDT" && !walletAddress) {
    return { error: "Wallet address is required for USDT." };
  }
  if (currency === "KES" && !bankAccountNumber) {
    return { error: "M-Pesa phone number is required." };
  }
  if (currency === "NGN" && (!bankAccountNumber || !bankName || !bankCode)) {
    return { error: "Bank account number and bank are required." };
  }
  if (currency === "GHS" && (!bankAccountNumber || !bankName)) {
    return { error: "Bank account number and bank name are required." };
  }
  if (currency === "USD") {
    return { error: "USD can't be withdrawn directly. Convert it first." };
  }

  // Defence in depth. The UI only ever lets a user pick from the provider's own
  // bank list, with no free-text code — but a client-submitted (name, code)
  // pair is still re-checked server-side before it is stored, because it ends
  // up in a provider-facing payout request where a wrong code sends money to
  // the wrong institution.
  if (currency === "NGN") {
    let banks;
    try {
      banks = await getBanks();
    } catch (err) {
      return { error: toCustomerError(err, "withdrawals.parseRecipientFields") };
    }
    if (!banks.some((b) => b.code === bankCode && b.name === bankName)) {
      return { error: "Select your bank from the list." };
    }
  }

  return {
    accountHolderName,
    bankAccountNumber: currency === "USDT" ? null : bankAccountNumber,
    bankName: currency === "USDT" || currency === "KES" ? null : bankName,
    walletAddress: currency === "USDT" ? walletAddress : null,
    bankCode: currency === "NGN" ? bankCode : null,
    // BSC is the only network this account's USDT balance accepts, so there is
    // nothing for the user to choose between — but it is stored on the row
    // rather than hardcoded at the payout call site, so the address and its
    // network live together.
    network: currency === "USDT" ? "BSC" : null,
  };
}

export async function setWithdrawalRecipient(
  _prevState: WithdrawalActionState,
  formData: FormData,
): Promise<WithdrawalActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currency = String(formData.get("currency") ?? "") as Currency;
  const parsed = await parseRecipientFields(currency, formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.rpc("set_withdrawal_recipient", {
    p_currency: currency,
    p_account_holder_name: parsed.accountHolderName,
    p_bank_account_number: parsed.bankAccountNumber,
    p_bank_name: parsed.bankName,
    p_wallet_address: parsed.walletAddress,
    p_bank_code: parsed.bankCode,
    p_network: parsed.network,
  });

  if (error) return { error: error.message };
  revalidatePath("/profile");
  revalidatePath("/withdraw");
  return { ok: true };
}

export interface RequestRecipientChangeState {
  error?: string;
  requested?: boolean;
}

/**
 * Starts the change flow for an existing currency's recipient. The password
 * check happens in confirmRecipientChange; this only records that a change was
 * properly requested, so confirm can refuse to act on a request that never
 * happened or has gone stale.
 */
export async function requestRecipientChange(
  currency: Currency,
): Promise<RequestRecipientChangeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("request_recipient_change", { p_currency: currency });
  if (error) return { error: error.message };
  return { requested: true };
}

/**
 * Password re-verification before a recipient change. signInWithPassword
 * against the user's own account IS the verification — no new code storage or
 * delivery infrastructure is needed for it, unlike an email OTP. A Postgres
 * function cannot check a Supabase Auth password hash, so this has to happen
 * in TS, immediately before the privileged RPC.
 */
export async function confirmRecipientChange(
  _prevState: WithdrawalActionState,
  formData: FormData,
): Promise<WithdrawalActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const currency = String(formData.get("currency") ?? "") as Currency;
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter your password to confirm." };

  const parsed = await parseRecipientFields(currency, formData);
  if ("error" in parsed) return parsed;

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (authError) return { error: "Incorrect password." };

  const { error } = await supabase.rpc("confirm_recipient_change", {
    p_currency: currency,
    p_account_holder_name: parsed.accountHolderName,
    p_bank_account_number: parsed.bankAccountNumber,
    p_bank_name: parsed.bankName,
    p_wallet_address: parsed.walletAddress,
    p_bank_code: parsed.bankCode,
    p_network: parsed.network,
  });

  if (error) return { error: error.message };
  revalidatePath("/profile");
  revalidatePath("/withdraw");
  return { ok: true };
}

export async function setTransactionPin(
  _prevState: WithdrawalActionState,
  formData: FormData,
): Promise<WithdrawalActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pin = String(formData.get("pin") ?? "").trim();
  const confirmPin = String(formData.get("confirmPin") ?? "").trim();

  if (!/^\d{4,6}$/.test(pin)) return { error: "PIN must be 4 to 6 digits." };
  if (pin !== confirmPin) return { error: "The two PINs don't match." };

  const { error } = await supabase.rpc("set_withdrawal_pin", { p_pin: pin });
  if (error) return { error: error.message };
  revalidatePath("/profile");
  return { ok: true };
}

/** Same trust model as confirmRecipientChange: password re-checked here first. */
export async function changeTransactionPin(
  _prevState: WithdrawalActionState,
  formData: FormData,
): Promise<WithdrawalActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter your password to confirm." };

  const pin = String(formData.get("pin") ?? "").trim();
  const confirmPin = String(formData.get("confirmPin") ?? "").trim();
  if (!/^\d{4,6}$/.test(pin)) return { error: "PIN must be 4 to 6 digits." };
  if (pin !== confirmPin) return { error: "The two PINs don't match." };

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (authError) return { error: "Incorrect password." };

  const { error } = await supabase.rpc("change_withdrawal_pin", { p_pin: pin });
  if (error) return { error: error.message };
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Tells the user, before they confirm, whether a withdrawal will be instant or
 * will wait for approval. Deliberately the SAME function the payout path calls,
 * so the preview can never promise something the execution path then refuses.
 */
export async function previewWithdrawalRouting(currency: Currency, amount: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!Number.isFinite(amount) || amount <= 0) return null;

  try {
    const routing = await evaluateWithdrawalRouting({ userId: user.id, currency, amount });
    return {
      automated: routing.automated,
      reason: routing.reason,
      thresholdUsd: routing.thresholdUsd,
      windowHours: routing.windowHours,
    };
  } catch (err) {
    console.error("[withdrawals.previewWithdrawalRouting] failed", err);
    // No preview is better than a wrong one. The UI falls back to saying the
    // timing will be confirmed after submitting.
    return null;
  }
}

export interface RequestWithdrawalState {
  error?: string;
  transactionId?: string;
  automated?: boolean;
}

export async function requestWithdrawal(
  _prevState: RequestWithdrawalState,
  formData: FormData,
): Promise<RequestWithdrawalState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currency = String(formData.get("currency") ?? "") as Currency;
  const amount = Number(formData.get("amount"));
  const pin = String(formData.get("pin") ?? "").trim();

  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount." };
  if (!pin) return { error: "Enter your transaction PIN." };

  // The provider has its own minimum payout amount, below which a payout fails
  // with a generic validation error AFTER the balance has been debited. This is
  // recomputed server-side rather than trusted from the client, and it cannot
  // live in SQL because the function has no live rate available to it.
  //
  // The original of this check compared the RATE against the minimum instead of
  // amount × rate, which made it pass for any fiat amount at all whenever the
  // rate exceeded the minimum — i.e. always, for every currency here. Fixed.
  let equivalentUsd: number;
  try {
    equivalentUsd = await usdEquivalent(currency, amount);
  } catch (err) {
    return { error: toCustomerError(err, "withdrawals.requestWithdrawal.minimum") };
  }
  if (equivalentUsd < MINIMUM_WITHDRAWAL_USDT_THRESHOLD) {
    return {
      error: `The minimum withdrawal is about ${MINIMUM_WITHDRAWAL_USDT_THRESHOLD} USD in ${currency}.`,
    };
  }

  const { data: transactionId, error } = await supabase.rpc("create_withdrawal_request", {
    p_currency: currency,
    p_amount: amount,
    p_pin: pin,
  });

  if (error) return { error: error.message };

  let automated = false;
  if (transactionId) {
    // attemptAutomatedPayout never throws: the balance is already debited by
    // this point, and a payout-API problem must leave the row in the manual
    // queue rather than strand it.
    await attemptAutomatedPayout(transactionId, user.id, currency, amount);

    const { data: row } = await supabase
      .from("transactions")
      .select("status, provider")
      .eq("id", transactionId)
      .maybeSingle();
    automated = row?.provider === "busha" && row?.status !== "pending";
  }

  revalidatePath("/home");
  revalidatePath("/transactions");
  revalidatePath("/withdraw");
  return { transactionId: transactionId ?? undefined, automated };
}

"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import * as busha from "@/lib/busha/client";
import * as klasha from "@/lib/klasha/client";
import { depositAvailability } from "@/lib/deposits/availability";
import { toCustomerError } from "@/lib/provider-error";
import { fiatMinimumDeposit } from "@/lib/busha/limits";
import { formatAmount } from "@/lib/currencies";

/**
 * Deposits.
 *
 * Which currency goes where, and why — this mapping is the result of live
 * testing, not a preference:
 *   NGN, KES, USDT  the primary provider. Confirmed working.
 *   GHS             the secondary provider, because the primary rejects GHS
 *                   outright on this account. Behind a flag that ships OFF,
 *                   because that path has never completed a live call (see
 *                   src/lib/klasha/client.ts). While off, GHS deposit is shown
 *                   as unavailable rather than offered and then failing.
 *   USD             not depositable at all. USD arrives via /receive, from a
 *                   verified provider webhook, and nothing else credits it.
 */

export interface DepositQuoteState {
  error?: string;
  quoteId?: string;
  /** Provider fee, which is deducted from what lands in the wallet. */
  fee?: string;
  /**
   * The provider's own quoted target_amount — the exact figure the deposit will
   * credit. NOT `grossAmount - fee` recomputed here, so the payment screen can
   * never show a net that drifts from what actually lands.
   */
  netAmount?: string;
  /**
   * The provider's own quoted source_amount — the real figure the user must
   * transfer, which can legitimately differ from what they typed. See
   * quoteForDesiredNetDeposit below.
   */
  grossAmount?: string;
  /**
   * What the user typed. Kept separate from gross and net so the minimum
   * re-check in initiateDeposit keeps applying to what they asked to have
   * credited, rather than to a grossed-up transfer figure.
   */
  amount?: string;
  currency?: Currency;
}

/**
 * Quotes a deposit so that the NET credited equals what the user asked for.
 *
 * THE BUG THIS FIXES. Confirmed by live testing against the real provider
 * account, not assumed: a same-currency deposit quote behaves differently per
 * currency depending on that currency's fee TYPE.
 *
 *   KES (percentage fee) — source_amount is treated as the desired NET. The
 *     response's source_amount comes back already grossed up to cover the fee,
 *     and target_amount equals what was asked for.
 *   NGN (fixed fee) — source_amount is echoed back unchanged, a true forward
 *     quote, and target_amount = source_amount - fee, i.e. LESS than asked.
 *   USDT — no fee on this account today, so the two are equal either way.
 *
 * The visible symptom was three figures that did not add up: "Transfer exactly
 * KSh200 / fee KSh2 / you will receive KSh200". The cause was displaying the
 * user's own typed amount as the transfer figure rather than the provider's
 * quoted source_amount — which coincided for NGN (echoed back) and did not for
 * KES (grossed up).
 *
 * This does NOT hardcode which currency behaves which way. It re-quotes with
 * (desiredNet + fee) only when the first quote's target_amount does not already
 * match the desired net. That is correct for both behaviours observed live, and
 * self-corrects if the provider's fee model for any currency changes — whereas
 * a per-currency table would silently go stale.
 */
async function quoteForDesiredNetDeposit(
  currency: Currency,
  desiredNet: number,
): Promise<busha.BushaQuote> {
  const first = await busha.createQuote({
    sourceCurrency: currency,
    targetCurrency: currency,
    sourceAmount: desiredNet.toString(),
    isDeposit: true,
  });

  // Already a net-denominated quote (the percentage-fee behaviour). Nothing to
  // correct — a second call would only cost a round trip and a new quote id.
  if (Math.abs(Number(first.target_amount) - desiredNet) < 0.01) return first;

  const fee = first.fees.reduce((sum, f) => sum + Number(f.amount.amount), 0);
  return busha.createQuote({
    sourceCurrency: currency,
    targetCurrency: currency,
    sourceAmount: (desiredNet + fee).toString(),
    isDeposit: true,
  });
}

/** Real pricing preview — a same-currency quote against the live endpoint. */
export async function getDepositQuote(
  _prevState: DepositQuoteState,
  formData: FormData,
): Promise<DepositQuoteState> {
  const currency = String(formData.get("currency") ?? "").toUpperCase() as Currency;
  const amount = String(formData.get("amount") ?? "");

  const availability = depositAvailability(currency);
  if (!availability.available) return { error: availability.reason };
  if (availability.provider !== "busha") {
    // The secondary provider's collection endpoint has no quote step at all,
    // so there is nothing to preview on that path.
    return { error: "This deposit method doesn't support a fee preview." };
  }

  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return { error: "Enter a valid amount." };
  }

  const minimum = fiatMinimumDeposit(currency);
  if (minimum != null && Number(amount) < minimum) {
    return { error: `The minimum ${currency} deposit is ${formatAmount(currency, minimum)}.` };
  }

  try {
    const quote = await quoteForDesiredNetDeposit(currency, Number(amount));
    const fee = quote.fees.reduce((sum, f) => sum + Number(f.amount.amount), 0);
    return {
      quoteId: quote.id,
      fee: fee.toFixed(2),
      netAmount: Number(quote.target_amount).toFixed(2),
      grossAmount: Number(quote.source_amount).toFixed(2),
      amount,
      currency,
    };
  } catch (err) {
    return { error: toCustomerError(err, "deposits.getDepositQuote") };
  }
}

export interface DepositActionState {
  error?: string;
  depositId?: string;
  bankDetails?: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    expiresAt: string;
  };
  cryptoAddress?: { address: string; network: string; expiresAt: string };
  /** The secondary provider's hosted payment page, on the GHS path. */
  redirectUrl?: string;
}

/**
 * Executes the quote, records a pending deposit and returns whatever payment
 * instructions the provider generated. The wallet is credited only when the
 * provider confirms funds received — never here.
 *
 * The deposit row is written with the service-role client because no insert
 * policy exists for regular users: a user must not be able to assert that a
 * deposit happened.
 */
export async function initiateDeposit(
  _prevState: DepositActionState,
  formData: FormData,
): Promise<DepositActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currency = String(formData.get("currency") ?? "").toUpperCase() as Currency;
  const availability = depositAvailability(currency);
  if (!availability.available) return { error: availability.reason };

  if (availability.provider === "klasha") {
    return initiateKlashaGhsDeposit(supabase, user.id, formData);
  }

  const quoteId = String(formData.get("quoteId") ?? "");
  if (!quoteId) return { error: "Missing quote." };

  // Re-checked here, not only in getDepositQuote. This is the point of no
  // return — the provider's transfer exists once createTransfer succeeds, and
  // on the bank-transfer path the user then sends real money against it. It
  // must not rely on whatever called this with a quote id having enforced the
  // minimum upstream.
  const requestedAmount = Number(formData.get("amount"));
  const minimum = fiatMinimumDeposit(currency);
  if (minimum != null && Number.isFinite(requestedAmount) && requestedAmount < minimum) {
    return { error: `The minimum ${currency} deposit is ${formatAmount(currency, minimum)}.` };
  }

  let transfer: busha.BushaTransfer;
  try {
    transfer = await busha.createTransfer(quoteId);
  } catch (err) {
    return { error: toCustomerError(err, "deposits.initiateDeposit") };
  }

  const admin = createAdminClient();
  // Record the provider's own confirmed target_amount (net of their gateway
  // fee), not the gross amount the user asked to deposit. Confirmed live: a
  // ₦2,000 deposit quote returns a target_amount of 1900 after a ₦100 fee, so
  // recording the requested amount over-credits by the fee every single time.
  const { data: deposit, error: insertError } = await admin
    .from("deposits")
    .insert({
      user_id: user.id,
      currency,
      amount: Number(transfer.target_amount),
      provider: "busha",
      provider_reference: transfer.id,
    })
    .select("id")
    .single();

  // Never the raw database message. A constraint name or a column list tells
  // the user nothing they can act on and tells anyone else more about the
  // schema than they should have. The detail goes to the logs instead, where
  // it is actually useful.
  if (insertError) {
    console.error("[deposits.initiateDeposit] deposit row insert failed", {
      userId: user.id,
      transferId: transfer.id,
      error: insertError,
    });
    return { error: "We couldn't record that deposit. Please contact support before sending any money." };
  }

  if (transfer.pay_in.address) {
    return {
      depositId: deposit.id,
      cryptoAddress: {
        address: transfer.pay_in.address,
        network: transfer.pay_in.network ?? "",
        expiresAt: transfer.pay_in.expires_at ?? "",
      },
    };
  }

  // Confirmed live: the field is `recipient_details`, not `payer_details`.
  const details = transfer.pay_in.recipient_details;
  return {
    depositId: deposit.id,
    bankDetails: {
      accountName: details?.account_name ?? "",
      accountNumber: details?.account_number ?? "",
      bankName: details?.bank_name ?? "",
      expiresAt: transfer.pay_in.expires_at ?? "",
    },
  };
}

async function initiateKlashaGhsDeposit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
): Promise<DepositActionState> {
  const amount = String(formData.get("amount") ?? "");
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return { error: "Enter a valid amount." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, email")
    .eq("id", userId)
    .single();

  if (!profile?.phone) {
    return { error: "Add a phone number to your profile before depositing." };
  }

  const txRef = randomUUID();
  // Server-only — no NEXT_PUBLIC_ prefix, which would ship it to the browser
  // for no reason.
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  let result: klasha.KlashaCollectionResult;
  try {
    result = await klasha.createCollection({
      txRef,
      currency: "GHS",
      amount,
      email: profile.email,
      phoneNumber: profile.phone,
      fullName: profile.full_name ?? profile.email,
      redirectUrl: `${appUrl}/home`,
    });
  } catch (err) {
    return { error: toCustomerError(err, "deposits.initiateKlashaGhsDeposit") };
  }

  const admin = createAdminClient();
  const { data: deposit, error: insertError } = await admin
    .from("deposits")
    .insert({
      user_id: userId,
      currency: "GHS",
      amount: Number(amount),
      provider: "klasha",
      provider_reference: result.tx_ref,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[deposits.initiateKlashaGhsDeposit] deposit row insert failed", {
      userId,
      txRef,
      error: insertError,
    });
    return { error: "We couldn't record that deposit. Please contact support before sending any money." };
  }

  return { depositId: deposit.id, redirectUrl: result.meta.authorization.redirect };
}

export interface DepositStatusState {
  status?: "pending" | "processing" | "completed" | "failed";
  error?: string;
}

/**
 * Poll target for the deposit instructions screen.
 *
 * This does NOT simply read our own status column and trust the webhook or the
 * cron to have updated it. Neither can be relied on: the provider's webhook
 * has never once delivered to this kind of endpoint for this account, and a
 * platform cron does not run at all until an external scheduler is wired up.
 * So while a deposit is pending, every poll re-checks the provider directly
 * and self-heals — the user is credited within one poll cycle even when both
 * other automated paths are dead.
 */
export async function checkDepositStatus(depositId: string): Promise<DepositStatusState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("deposits")
    .select("status, provider, provider_reference")
    .eq("id", depositId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[deposits.checkDepositStatus] deposit lookup failed", { depositId, error });
    return { error: "We couldn't check that deposit just now." };
  }
  if (!data) return { error: "Deposit not found." };

  if (data.status === "pending" && data.provider === "busha" && data.provider_reference) {
    try {
      const transfer = await busha.getTransfer(data.provider_reference);
      const admin = createAdminClient();

      if (transfer.status === "funds_received") {
        // The provider's transfer amount self-corrects to whatever actually
        // arrived — never assume it matches the request. Confirmed live: a
        // user can request 10 USDT and send 12, and the provider reports 12
        // once received. Crediting the stale requested figure short-changes
        // them by the difference.
        const { error: creditError } = await admin.rpc("credit_deposit", {
          p_deposit_id: depositId,
          p_actual_amount: Number(transfer.target_amount),
        });
        if (creditError) {
          console.error("[deposits.checkDepositStatus] credit_deposit failed", {
            depositId,
            error: creditError,
          });
        } else {
          revalidatePath("/home");
          revalidatePath("/transactions");
          return { status: "completed" };
        }
      } else if (transfer.status === "cancelled" || transfer.status === "funds_not_delivered") {
        const { error: failError } = await admin.rpc("fail_deposit", {
          p_deposit_id: depositId,
          p_reason: `Provider reported ${transfer.status}`,
        });
        if (failError) {
          console.error("[deposits.checkDepositStatus] fail_deposit failed", {
            depositId,
            error: failError,
          });
        } else {
          revalidatePath("/transactions");
          return { status: "failed" };
        }
      }
    } catch (err) {
      // A transient provider error must not fail the poll. Report what our own
      // row says and log it, so a persistent failure is visible rather than
      // swallowed on every tick.
      console.error("[deposits.checkDepositStatus] provider lookup failed", {
        depositId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  return { status: data.status };
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Currency, TransactionStatus } from "@/lib/types/database";
import { isMostRecentForCurrency, type ActivitySource } from "@/lib/transactions";

/**
 * Full detail for one activity row.
 *
 * Deliberately separate from the list query, which stays lightweight — this is
 * only fetched when a user actually opens a row. Fields that do not apply to a
 * given source are null, and the detail view decides what to render.
 */
export interface ActivityDetail {
  source: ActivitySource;
  type: string;
  status: TransactionStatus | "refunded";
  createdAt: string;
  sourceAmount: number;
  sourceCurrency: Currency;
  targetAmount: number | null;
  targetCurrency: Currency | null;
  fee: number | null;
  reference: string | null;
  /** Where the money went or came from, in one line. */
  description: string | null;
  /** Set only when the confirmed amount differs from the requested one. */
  confirmedAmount: number | null;
  /** Why a row failed, declined or was refunded. */
  declineReason: string | null;
  /** Rate breakdown, conversions only. */
  providerRate: number | null;
  markupRate: number | null;
  customerRate: number | null;
  /** Prepaid electricity token, bills only. */
  token: string | null;
  units: string | null;
  /** Payout routing, withdrawals only. */
  requiresExtraVerification: boolean;
  /**
   * The relevant wallet's current balance. `isMostRecent` decides the label:
   * "New balance" when nothing has touched that currency since, "Current
   * balance" otherwise — presenting a stale figure as the balance this
   * transaction produced is worse than not showing one.
   */
  balanceAfter: number | null;
  isMostRecent: boolean;
}

export interface ActivityDetailState {
  detail?: ActivityDetail;
  error?: string;
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function resolveBalanceInfo(
  supabase: ServerClient,
  userId: string,
  currency: Currency,
  createdAt: string,
): Promise<{ balanceAfter: number | null; isMostRecent: boolean }> {
  const [{ data: wallet }, isMostRecent] = await Promise.all([
    supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .eq("currency", currency)
      .maybeSingle(),
    isMostRecentForCurrency(supabase, userId, currency, createdAt),
  ]);
  return { balanceAfter: wallet?.balance ?? null, isMostRecent };
}

export async function getActivityDetail(
  source: ActivitySource,
  id: string,
): Promise<ActivityDetailState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (source === "deposit") return depositDetail(supabase, user.id, id);
  if (source === "bill") return billDetail(supabase, user.id, id);
  return transactionDetail(supabase, user.id, id);
}

async function depositDetail(
  supabase: ServerClient,
  userId: string,
  id: string,
): Promise<ActivityDetailState> {
  const { data, error } = await supabase
    .from("deposits")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Deposit not found." };

  const { balanceAfter, isMostRecent } = await resolveBalanceInfo(
    supabase,
    userId,
    data.currency,
    data.created_at,
  );

  return {
    detail: {
      source: "deposit",
      type: "deposit",
      status: data.status,
      createdAt: data.created_at,
      sourceAmount: data.amount,
      sourceCurrency: data.currency,
      targetAmount: null,
      targetCurrency: null,
      fee: null,
      reference: data.provider_reference,
      description: null,
      // Shown beside the requested amount when they differ, which is a real
      // case: a 10 USDT request can arrive as 12.
      confirmedAmount:
        data.confirmed_amount != null && data.confirmed_amount !== data.amount
          ? data.confirmed_amount
          : null,
      declineReason: data.decline_reason,
      providerRate: null,
      markupRate: null,
      customerRate: null,
      token: null,
      units: null,
      requiresExtraVerification: false,
      balanceAfter,
      isMostRecent,
    },
  };
}

async function billDetail(
  supabase: ServerClient,
  userId: string,
  id: string,
): Promise<ActivityDetailState> {
  const { data, error } = await supabase
    .from("bill_payments")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Payment not found." };

  const { balanceAfter, isMostRecent } = await resolveBalanceInfo(
    supabase,
    userId,
    data.currency,
    data.created_at,
  );

  return {
    detail: {
      source: "bill",
      type: data.category,
      status: data.status,
      createdAt: data.created_at,
      sourceAmount: data.amount,
      sourceCurrency: data.currency,
      targetAmount: null,
      targetCurrency: null,
      fee: data.fee,
      reference: data.provider_reference,
      description: data.customer_name
        ? `${data.biller_name} · ${data.customer_identifier} · ${data.customer_name}`
        : `${data.biller_name} · ${data.customer_identifier}`,
      confirmedAmount: null,
      declineReason: data.decline_reason,
      providerRate: null,
      markupRate: null,
      customerRate: null,
      // The token is the whole point of an electricity receipt: without it the
      // customer cannot load the units they just paid for.
      token: data.token,
      units: data.units,
      requiresExtraVerification: false,
      balanceAfter,
      isMostRecent,
    },
  };
}

async function transactionDetail(
  supabase: ServerClient,
  userId: string,
  id: string,
): Promise<ActivityDetailState> {
  const { data: tx, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!tx) return { error: "Transaction not found." };

  let description: string | null = null;

  if (tx.type === "withdrawal") {
    // Filtered by THIS transaction's currency. A user can have one recipient
    // per currency, and without the filter a USDT withdrawal's receipt can
    // show whichever row came back first — e.g. their NGN bank details.
    const { data: recipient } = await supabase
      .from("withdrawal_recipients")
      .select("*")
      .eq("user_id", userId)
      .eq("currency", tx.currency)
      .maybeSingle();

    if (recipient) {
      description = recipient.wallet_address
        ? `${tx.currency} (${recipient.network ?? "BSC"}) · ${recipient.wallet_address}`
        : [recipient.bank_name, recipient.bank_account_number, recipient.account_holder_name]
            .filter(Boolean)
            .join(" · ");
    }
  } else if (tx.type === "convert") {
    description = `${tx.currency} to ${tx.target_currency ?? "—"}`;
  }

  const resolvedTargetAmount = tx.actual_target_amount ?? tx.target_amount;
  const isConversion = tx.type === "convert" && tx.target_currency != null;

  // The balance lookup targets the currency the detail view describes as the
  // relevant one, so the two cannot disagree about which wallet is meant.
  const relevantCurrency = isConversion ? tx.target_currency! : tx.currency;
  const { balanceAfter, isMostRecent } = await resolveBalanceInfo(
    supabase,
    userId,
    relevantCurrency,
    tx.created_at,
  );

  return {
    detail: {
      source: "transaction",
      type: tx.type,
      status: tx.status,
      createdAt: tx.created_at,
      sourceAmount: tx.amount,
      sourceCurrency: tx.currency,
      targetAmount: resolvedTargetAmount,
      targetCurrency: tx.target_currency,
      fee: tx.fee ?? (tx.type === "withdrawal" && tx.target_amount != null ? tx.amount - tx.target_amount : null),
      reference: tx.provider_reference,
      description,
      confirmedAmount: null,
      // Covers both an admin rejection and a provider failure. A row that just
      // says "failed" sends the user to support to ask why.
      declineReason: tx.decline_reason ?? tx.automated_payout_attempt_failed_reason,
      providerRate: tx.provider_rate,
      markupRate: tx.markup_rate,
      customerRate: tx.customer_rate,
      token: null,
      units: null,
      requiresExtraVerification: tx.requires_extra_verification,
      balanceAfter,
      isMostRecent,
    },
  };
}

import type { createClient } from "@/lib/supabase/server";
import type { Currency, TransactionStatus } from "@/lib/types/database";
import { isMostRecentForCurrency, type ActivitySource } from "@/lib/transactions";
import { toRpcError } from "@/lib/provider-error";
import { describePayToChinaRecipient } from "@/lib/payToChina/describe";

/**
 * Reading one activity row, as a plain module — NOT a `"use server"` file.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A SERVER-ACTION MODULE, WHICH IS A SECURITY DECISION
 *
 * This used to be src/lib/actions/activity.ts, with `"use server"` at the
 * top. Group 4a needs the same loader from a Route Handler (the PNG receipt),
 * and the receipt has one extra rule: an admin may fetch anybody's. The
 * obvious move is to export a `loadDetail(userId, …)` from the existing file
 * and let both callers pass the id they want.
 *
 * That would have been a privilege escalation. EVERY export of a
 * `"use server"` module is a callable endpoint reachable by POST from any
 * browser with a session — so a `userId` parameter on such an export is an
 * invitation to read another customer's transactions by changing one
 * argument. The type system does not stop it and neither does RLS, because
 * the query would be running as whatever client the function builds.
 *
 * So the loaders live here, in a module with no `"use server"` directive and
 * therefore no browser-reachable surface, and every caller is responsible for
 * establishing WHOSE id it is passing:
 *
 *   src/lib/actions/activity.ts   the signed-in user's own, from getUser()
 *   the receipt route             the same, or — for an admin — the owner of
 *                                 the row, resolved server-side
 *
 * The `userId` parameter is still load-bearing in every query below: the row
 * reads are `.eq("user_id", userId)` as well as being under RLS, so a wrong
 * id returns nothing rather than somebody else's money.
 */

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
  /**
   * A short-lived signed URL for the payment receipt on a completed Pay to
   * China request. SIGNED, never public: the proof lives in a private bucket
   * whose folder is the customer's own id, and minting a URL per view is
   * what keeps it that way. Null for everything else.
   */
  proofUrl: string | null;
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

/**
 * The whole loader, for one row belonging to one user.
 *
 * The caller supplies both the client and the id, and owns the question of
 * whose id it is — see the note at the top of this file.
 */
export async function loadActivityDetail(
  supabase: ServerClient,
  userId: string,
  source: ActivitySource,
  id: string,
): Promise<ActivityDetailState> {
  if (source === "deposit") return depositDetail(supabase, userId, id);
  if (source === "bill") return billDetail(supabase, userId, id);
  return transactionDetail(supabase, userId, id);
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

  if (error) return { error: toRpcError(error, "activity") };
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
      proofUrl: null,
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

  if (error) return { error: toRpcError(error, "activity") };
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
      proofUrl: null,
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

  if (error) return { error: toRpcError(error, "activity") };
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
  } else if (tx.type === "pay_to_china") {
    // The recipient SNAPSHOT for this request, not the user's saved list —
    // the receipt has to show who was actually paid, even if the saved
    // recipient has been edited since.
    const { data: recipient } = await supabase
      .from("pay_to_china_recipients")
      .select("*")
      .eq("transaction_id", tx.id)
      .eq("user_id", userId)
      .maybeSingle();

    description = recipient ? describePayToChinaRecipient(recipient) : null;
  }

  const resolvedTargetAmount = tx.actual_target_amount ?? tx.target_amount;
  const isConversion = tx.type === "convert" && tx.target_currency != null;

  // ── The payment receipt ──────────────────────────────────────────────────
  // A signed URL minted per view, valid for five minutes. The bucket is
  // private and the folder is this customer's own id; a public URL would
  // make a photograph of somebody's payment permanently reachable by anyone
  // who ever saw the link.
  let proofUrl: string | null = null;
  if (tx.type === "pay_to_china" && tx.payment_proof_ref) {
    const { data: signed, error: signError } = await supabase.storage
      .from("pay-to-china-proof")
      .createSignedUrl(tx.payment_proof_ref, 300);
    if (signError) {
      console.error("[activity] could not sign the payment proof", {
        transactionId: tx.id,
        error: signError.message,
      });
    }
    proofUrl = signed?.signedUrl ?? null;
  }

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
      proofUrl,
    },
  };
}

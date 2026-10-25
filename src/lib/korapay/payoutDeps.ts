import type { SupabaseClient } from "@supabase/supabase-js";
import {
  KorapayError,
  disburseToBank,
  disburseToMobileMoney,
  getAvailableBalance,
  getMobileMoneyOperators,
  queryDisbursement,
  resolveBankAccount,
} from "@/lib/korapay/client";
import type {
  KorapayPayoutDeps,
  PayoutQueryResult,
  SettlePayoutDeps,
} from "@/lib/korapay/payout";
import { notifyWithdrawalCompleted, notifyWithdrawalFailed } from "@/lib/notify/events";
import { adminNotificationRecipients, sendAdminPayoutBalanceEmail } from "@/lib/email";
import { formatAmount } from "@/lib/currencies";
import type { Currency, Database } from "@/lib/types/database";

/**
 * The real wiring for runKorapayPayout and settleKorapayPayout.
 *
 * Apart from payout.ts so that file stays import-free and runnable under
 * `node --test`, and apart from the callers so the synchronous attempt, the
 * retry cron, the webhook and the reconcile cron all share one set of
 * dependencies rather than four that drift.
 */

type AdminClient = SupabaseClient<Database>;

/**
 * A 404 from /transactions/:reference means the payout does not exist, which
 * is the one answer that lets a claim be released. Anything else — a 5xx, a
 * timeout, a refusal — leaves the question open and is re-thrown.
 */
async function queryPayout(reference: string): Promise<PayoutQueryResult> {
  try {
    const found = await queryDisbursement(reference);
    return { status: found.status, found: true };
  } catch (err) {
    if (err instanceof KorapayError && err.status === 404) {
      return { status: "not_found", found: false };
    }
    throw err;
  }
}

export function korapayPayoutDeps(
  admin: AdminClient,
  context: string,
  transaction: { id: string; currency: Currency; amount: number; userEmail?: string | null },
): KorapayPayoutDeps {
  return {
    availableBalance: (currency) => getAvailableBalance(currency),

    async mobileMoneyOperators() {
      const operators = await getMobileMoneyOperators("KE");
      return operators.map((op) => ({ slug: op.slug, name: op.name }));
    },

    async resolveAccountName(input) {
      const resolved = await resolveBankAccount(input);
      return resolved.account_name;
    },

    async claim(reference) {
      const { data, error } = await admin.rpc("claim_payout_attempt", {
        p_transaction_id: transaction.id,
        p_provider: "korapay",
        p_provider_reference: reference,
      });
      if (error) {
        // A claim that cannot be recorded must not be treated as won — that
        // is the only reading that cannot pay twice.
        console.error(`[${context}] claim failed`, { transactionId: transaction.id, error });
        return false;
      }
      return data === true;
    },

    async disburse(input) {
      const sent =
        input.destination.type === "bank"
          ? await disburseToBank({
              reference: input.reference,
              amount: input.amount,
              currency: input.currency,
              bankCode: input.destination.bankCode,
              accountNumber: input.destination.accountNumber,
              narration: "justpae withdrawal",
              customerName: input.customerName,
              customerEmail: input.customerEmail,
            })
          : await disburseToMobileMoney({
              reference: input.reference,
              amount: input.amount,
              currency: input.currency,
              operatorSlug: input.destination.operatorSlug,
              phoneNumber: input.destination.phoneNumber,
              narration: "justpae withdrawal",
              customerName: input.customerName,
              customerEmail: input.customerEmail,
            });
      return { status: sent.status };
    },

    query: queryPayout,

    async holdForBalance(reason) {
      const { data, error } = await admin.rpc("record_payout_balance_hold", {
        p_transaction_id: transaction.id,
        p_reason: reason,
      });
      if (error) {
        console.error(`[${context}] could not record the balance hold`, { error });
        return false;
      }
      return data === true;
    },

    async emailAdminsAboutBalance(reason) {
      const to = adminNotificationRecipients();
      if (to.length === 0) return;
      await sendAdminPayoutBalanceEmail({
        to,
        reason,
        currency: transaction.currency,
        amount: formatAmount(transaction.currency, transaction.amount),
        transactionId: transaction.id,
      });
    },

    async recordFailure(reason) {
      await admin.rpc("record_automated_payout_failure", {
        p_transaction_id: transaction.id,
        p_reason: reason.slice(0, 1000),
      });
    },

    async releaseClaim(reference, reason) {
      const { error } = await admin.rpc("release_payout_claim", {
        p_transaction_id: transaction.id,
        p_provider_reference: reference,
        p_reason: reason,
      });
      if (error) console.error(`[${context}] could not release the claim`, { error });
    },

    async complete() {
      await admin.rpc("complete_withdrawal_payout", { p_transaction_id: transaction.id });
    },

    async fail(reason) {
      await admin.rpc("fail_withdrawal_payout", {
        p_transaction_id: transaction.id,
        p_reason: reason,
      });
    },

    notifyCompleted: () => notifyWithdrawalCompleted(transaction.id),
    notifyFailed: (reason) => notifyWithdrawalFailed(transaction.id, reason),

    log(level, message, detail) {
      const line = `[${context}] ${message}`;
      if (level === "error") console.error(line, detail);
      else console.warn(line, detail);
    },
  };
}

/** The settle half, which starts from a reference rather than a row. */
export function korapaySettlePayoutDeps(admin: AdminClient, context: string): SettlePayoutDeps {
  return {
    query: queryPayout,

    async findWithdrawalByReference(reference) {
      const { data } = await admin
        .from("transactions")
        .select("id, status")
        .eq("type", "withdrawal")
        .eq("provider", "korapay")
        .eq("provider_reference", reference)
        .maybeSingle();
      return data ? { id: data.id, status: data.status } : null;
    },

    async complete(transactionId) {
      await admin.rpc("complete_withdrawal_payout", { p_transaction_id: transactionId });
    },

    async fail(transactionId, reason) {
      await admin.rpc("fail_withdrawal_payout", {
        p_transaction_id: transactionId,
        p_reason: reason,
      });
    },

    notifyCompleted: (transactionId) => notifyWithdrawalCompleted(transactionId),
    notifyFailed: (transactionId, reason) => notifyWithdrawalFailed(transactionId, reason),

    log(level, message, detail) {
      const line = `[${context}] ${message}`;
      if (level === "error") console.error(line, detail);
      else console.warn(line, detail);
    },
  };
}

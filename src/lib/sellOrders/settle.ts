import { createAdminClient } from "@/lib/supabase/admin";
import * as busha from "@/lib/busha/client";
import { resolveRoute } from "@/lib/rates/routes";
import { applyMarkupToAmount } from "@/lib/rates/markup";
import { notifyConversionCompleted, notifySellOrderCreditedUsdt } from "@/lib/notify/events";
import { settleSellOrder, type SellOrderClaim, type SellOrderSteps } from "@/lib/sellOrders/sequence";
import type { Currency } from "@/lib/types/database";

/**
 * The real wiring behind src/lib/sellOrders/sequence.ts: Supabase for every
 * ledger write, Busha for the one provider call.
 *
 * Called from exactly the three places credit_deposit already is — the
 * Busha webhook, the reconcile-deposits cron, and the deposit status poll —
 * right after each one succeeds, with the SAME amount that was just
 * credited. claim_sell_order_for_deposit is what makes calling this more
 * than once for the same deposit safe: see sequence.ts's own header.
 */
export async function settleSellOrderForDeposit(
  depositId: string,
  receivedAmount: number,
): Promise<void> {
  const admin = createAdminClient();

  const steps: SellOrderSteps<busha.BushaTransfer> = {
    claim: async () => {
      const { data, error } = await admin.rpc("claim_sell_order_for_deposit", {
        p_deposit_id: depositId,
        p_received_amount: receivedAmount,
      });
      if (error) {
        console.error("[sellOrders.settle] claim_sell_order_for_deposit failed", {
          depositId,
          error,
        });
        return null;
      }
      const row = data?.[0];
      if (!row) return null;

      const claim: SellOrderClaim = {
        sellOrderId: row.id,
        userId: row.user_id,
        targetCurrency: row.target_currency,
        receivedAmount: row.received_usdt_amount ?? receivedAmount,
        flagged: row.flagged,
        status: row.status === "received" ? "received" : "credited_usdt",
        holdId: row.hold_id ?? undefined,
      };
      return claim;
    },

    // A fresh route AND a fresh provider quote — nothing from the order's
    // own creation-time figures crosses into the sale. Same rule every
    // other conversion in this product follows: the server always
    // recomputes at execution time.
    quoteAndTransfer: async (claim) => {
      const target = claim.targetCurrency as Currency;
      const route = await resolveRoute("USDT", target);
      if (!route.available) {
        throw new Error(route.reason);
      }

      const quote = await busha.createQuote({
        sourceCurrency: "USDT",
        targetCurrency: target,
        sourceAmount: claim.receivedAmount.toFixed(2),
      });
      const transfer = await busha.createTransfer(quote.id);

      const rawTargetAmount = Number(transfer.target_amount);
      const customerTargetAmount = applyMarkupToAmount(rawTargetAmount, route.markupRate);

      return {
        transfer,
        delivered: isTransferDelivered(transfer.status),
        targetAmount: customerTargetAmount,
        providerReference: transfer.id,
        providerRate: route.providerRate,
        markupRate: route.markupRate,
        customerRate: route.customerRate,
      };
    },

    settle: async (claim, result) => {
      const { data, error } = await admin.rpc("settle_sell_order", {
        p_sell_order_id: claim.sellOrderId,
        p_hold_id: claim.holdId!,
        p_user_id: claim.userId,
        p_target_amount: result.targetAmount,
        p_provider_reference: result.providerReference,
        p_provider_rate: result.providerRate,
        p_markup_rate: result.markupRate,
        p_customer_rate: result.customerRate,
      });
      if (error || !data) {
        // The provider transfer already happened — this needs a human, loud
        // in the logs, exactly like executeConversion's own settle failure.
        console.error("[sellOrders.settle] settle_sell_order failed after the provider executed", {
          sellOrderId: claim.sellOrderId,
          holdId: claim.holdId,
          error,
        });
        throw new Error("Ledger write failed after the provider executed.");
      }
      return data;
    },

    completeConversion: async (transactionId) => {
      const { error } = await admin.rpc("complete_conversion", { p_transaction_id: transactionId });
      if (error) {
        console.error("[sellOrders.settle] complete_conversion failed", { transactionId, error });
      }
    },

    creditUsdtFallback: async (claim, reason) => {
      const { error } = await admin.rpc("release_conversion_hold", {
        p_hold_id: claim.holdId!,
        p_user_id: claim.userId,
        p_reason: reason,
      });
      if (error) {
        console.error("[sellOrders.settle] COULD NOT RELEASE A SELL-ORDER HOLD — USDT is held", {
          sellOrderId: claim.sellOrderId,
          holdId: claim.holdId,
          error,
        });
      }
      const { error: markError } = await admin.rpc("mark_sell_order_credited_usdt", {
        p_sell_order_id: claim.sellOrderId,
        p_reason: reason,
      });
      if (markError) {
        console.error("[sellOrders.settle] mark_sell_order_credited_usdt failed", {
          sellOrderId: claim.sellOrderId,
          error: markError,
        });
      }
    },

    notifyCreditedUsdt: async (sellOrderId) => {
      await notifySellOrderCreditedUsdt(sellOrderId);
    },

    notifySold: async (transactionId) => {
      await notifyConversionCompleted(transactionId);
    },
  };

  try {
    await settleSellOrder(steps);
  } catch (err) {
    // Never throws out of here: this runs inside the webhook, the cron and
    // the status poll, none of which may fail because a sell order's
    // settlement hit an unexpected error — the deposit itself already
    // credited successfully by the time this is called.
    console.error("[sellOrders.settle] settleSellOrderForDeposit threw", {
      depositId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/** Same pair this product already treats as "landed" everywhere else. */
function isTransferDelivered(status: busha.BushaTransfer["status"]): boolean {
  return status === "funds_converted" || status === "funds_delivered";
}

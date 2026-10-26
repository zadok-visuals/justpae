"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDepositQuote, initiateDeposit, checkDepositStatus } from "@/lib/actions/deposits";
import { resolveRoute } from "@/lib/rates/routes";
import { getMinimumConversionAmount } from "@/lib/busha/limits";
import { toCustomerError, toRpcError } from "@/lib/provider-error";
import { isPinLockedError, isWrongPinError, resolvePinError } from "@/lib/pin";
import { formatAmount } from "@/lib/currencies";
import type { Currency, SellOrder } from "@/lib/types/database";
import { requireSessionUser } from "@/lib/auth/session";

/**
 * /sell's server side. The fiat this produces lands in the user's OWN
 * wallet, always — the money logic itself is two existing paths (a USDT
 * deposit, a conversion, settled automatically once that deposit lands) —
 * see src/lib/sellOrders for the settlement sequence and migration 0046 for
 * the schema.
 */

export interface BeginSellOrderState {
  error?: string;
  sellOrderId?: string;
  depositId?: string;
  cryptoAddress?: { address: string; network: string; expiresAt: string };
}

/**
 * Step 2's confirm. One PIN authorises the whole order — everything after
 * this point (the deposit landing, the automated sale) runs unattended, so
 * this is the only place in the flow a customer is actually present to give
 * one. create_sell_order verifies it; nothing downstream checks it again.
 */
export async function beginSellOrder(
  _prevState: BeginSellOrderState,
  formData: FormData,
): Promise<BeginSellOrderState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const amount = Number(formData.get("amount"));
  const targetCurrency = String(formData.get("targetCurrency") ?? "").toUpperCase() as Currency;
  const pin = String(formData.get("pin") ?? "").trim();

  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount." };
  if (!pin) return { error: "Enter your transaction PIN." };

  const minimum = getMinimumConversionAmount("USDT");
  if (amount < minimum) {
    return { error: `The minimum sale is ${formatAmount("USDT", minimum)}.` };
  }

  // Priced fresh, server-side, right before the order is opened. This is a
  // DISPLAY figure for the order (estimated_target_amount) — settlement
  // re-resolves its own fresh route later and never reads this one back.
  let route;
  try {
    route = await resolveRoute("USDT", targetCurrency);
  } catch (err) {
    return {
      error: toCustomerError(err, "sellOrders.beginSellOrder", { currency: "USDT", action: "conversion" }),
    };
  }
  if (!route.available) return { error: route.reason };

  const admin = createAdminClient();
  const { data: sellOrderId, error } = await admin.rpc("create_sell_order", {
    p_user_id: user.id,
    p_expected_usdt_amount: amount,
    p_target_currency: targetCurrency,
    p_estimated_target_amount: amount * route.customerRate,
    p_provider_rate: route.providerRate,
    p_markup_rate: route.markupRate,
    p_customer_rate: route.customerRate,
    p_pin: pin,
  });

  if (error) {
    if (isWrongPinError(error) || isPinLockedError(error)) {
      return { error: await resolvePinError({ userId: user.id, email: user.email, error }) };
    }
    return { error: toRpcError(error, "sell") };
  }
  if (!sellOrderId) return { error: "Could not start that sale." };

  // Then the existing USDT deposit flow, reused exactly as /deposit uses it
  // — a quote for the fee preview, then the real transfer.
  const quoteForm = new FormData();
  quoteForm.set("currency", "USDT");
  quoteForm.set("amount", amount.toFixed(2));
  const quoteState = await getDepositQuote({}, quoteForm);
  if (quoteState.error || !quoteState.quoteId) {
    return { sellOrderId, error: quoteState.error ?? "Could not start the USDT deposit for that sale." };
  }

  const depositForm = new FormData();
  depositForm.set("currency", "USDT");
  depositForm.set("quoteId", quoteState.quoteId);
  depositForm.set("amount", amount.toFixed(2));
  const depositState = await initiateDeposit({}, depositForm);
  if (depositState.error || !depositState.depositId) {
    return { sellOrderId, error: depositState.error ?? "Could not start the USDT deposit for that sale." };
  }

  const { error: linkError } = await admin.rpc("link_sell_order_deposit", {
    p_sell_order_id: sellOrderId,
    p_user_id: user.id,
    p_deposit_id: depositState.depositId,
  });
  if (linkError) {
    console.error("[sellOrders.beginSellOrder] link_sell_order_deposit failed", {
      sellOrderId,
      depositId: depositState.depositId,
      error: linkError,
    });
    return { sellOrderId, error: "Could not link that deposit. Please contact support." };
  }

  return {
    sellOrderId,
    depositId: depositState.depositId,
    cryptoAddress: depositState.cryptoAddress,
  };
}

/**
 * The order plus what it actually sold for — read off the linked
 * transaction's own row, never estimated, once there is one. The receipt
 * must show what landed in the wallet, and that figure lives on
 * `transactions.target_amount` (actual_target_amount first, when the
 * reconciler later corrects it), not on the order's own creation-time
 * estimate.
 */
export interface SellOrderView extends SellOrder {
  soldAmount: number | null;
}

/** RLS does the real work here: "sell_orders: read own" is the table's only policy. */
export async function getSellOrder(sellOrderId: string): Promise<SellOrderView | null> {
  const supabase = await createClient();
  const user = await requireSessionUser();

  const { data } = await supabase
    .from("sell_orders")
    .select("*")
    .eq("id", sellOrderId)
    .eq("user_id", user.id)
    .maybeSingle();

  const order = (data as SellOrder | null) ?? null;
  if (!order) return null;

  if (!order.conversion_transaction_id) return { ...order, soldAmount: null };

  const { data: tx } = await supabase
    .from("transactions")
    .select("target_amount, actual_target_amount")
    .eq("id", order.conversion_transaction_id)
    .maybeSingle();

  return { ...order, soldAmount: tx ? (tx.actual_target_amount ?? tx.target_amount) : null };
}

/**
 * The status screen's poll target. Self-heals exactly like
 * deposits.checkDepositStatus does for /deposit: while the order is still
 * waiting, it re-checks the linked deposit directly rather than trusting a
 * webhook to have run — which also runs the sell order's own settlement as
 * a side effect (see settleSellOrderForDeposit), so the customer watching
 * this very screen is often the first of the three callers to get there.
 */
export async function pollSellOrder(sellOrderId: string): Promise<SellOrderView | null> {
  const order = await getSellOrder(sellOrderId);
  if (!order) return null;

  if (order.status === "awaiting_deposit" && order.deposit_id) {
    await checkDepositStatus(order.deposit_id);
    return getSellOrder(sellOrderId);
  }

  return order;
}

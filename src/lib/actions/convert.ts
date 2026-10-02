"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import * as busha from "@/lib/busha/client";
import { resolveRoute, resolveRoutesFrom, type ConversionRoute } from "@/lib/rates/routes";
import { applyMarkupToAmount } from "@/lib/rates/markup";
import { MINIMUM_USDT_EQUIVALENT } from "@/lib/busha/limits";
import { toCustomerError } from "@/lib/provider-error";
import { CURRENCY_CODES } from "@/lib/currencies";

/**
 * /convert's server side.
 *
 * Two rules this file exists to enforce, both of which the UI alone cannot:
 *
 *  1. The server ALWAYS recomputes the quote at execution time and ignores any
 *     rate the client sends. A client-supplied rate is an instruction to credit
 *     an arbitrary amount.
 *
 *  2. The minimum is checked BEFORE the provider is called, never after. Once a
 *     transfer response exists the transfer has already executed at the
 *     provider — rejecting post-hoc using its own response figures would be
 *     too late to stop a sub-minimum conversion, only early enough to strand
 *     it.
 */

/**
 * How long a shown quote stays valid. Drives the countdown on /convert.
 *
 * NOT exported: every export of a `"use server"` file must be an async
 * function, because Next.js treats each one as a callable server action. The
 * client never needs the number anyway — it counts down to the `expiresAt`
 * timestamp the quote carries.
 */
const QUOTE_TTL_SECONDS = 60;

export interface ConversionQuote {
  from: Currency;
  to: Currency;
  /** The amount the user typed, in whichever field they typed it. */
  sourceAmount: number;
  targetAmount: number;
  providerRate: number;
  markupRate: number;
  customerRate: number;
  /** ISO timestamp the countdown counts down to. */
  expiresAt: string;
  /** USDT-equivalent of the source amount, for the minimum message. */
  sourceUsdtEquivalent: number;
  belowMinimum: boolean;
}

export interface QuoteState {
  quote?: ConversionQuote;
  error?: string;
  /** Set when the pair itself is unroutable, so the UI can disable it. */
  unavailableReason?: string;
}

/**
 * Prices a conversion. `field` says which side the user typed, so the other
 * side is the one that gets recalculated — typing into either field has to
 * work, and rounding the wrong side makes the number the user typed drift
 * under their cursor.
 */
export async function quoteConversion(params: {
  from: Currency;
  to: Currency;
  amount: number;
  field: "source" | "target";
}): Promise<QuoteState> {
  const { from, to, amount, field } = params;

  if (!Number.isFinite(amount) || amount <= 0) return {};

  let route: ConversionRoute;
  try {
    route = await resolveRoute(from, to);
  } catch (err) {
    return { error: toCustomerError(err, "convert.quoteConversion") };
  }

  if (!route.available) return { unavailableReason: route.reason };

  const sourceAmount = field === "source" ? amount : amount / route.customerRate;
  const targetAmount = field === "source" ? amount * route.customerRate : amount;
  const sourceUsdtEquivalent = sourceAmount * route.sourceUsdtRate;

  return {
    quote: {
      from,
      to,
      sourceAmount: round2(sourceAmount),
      targetAmount: round2(targetAmount),
      providerRate: route.providerRate,
      markupRate: route.markupRate,
      customerRate: route.customerRate,
      expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
      sourceUsdtEquivalent,
      belowMinimum: sourceUsdtEquivalent < MINIMUM_USDT_EQUIVALENT,
    },
  };
}

export interface RouteAvailability {
  to: Currency;
  available: boolean;
  reason: string | null;
  customerRate: number | null;
}

/**
 * Every destination out of one wallet at once, so /convert can grey out the
 * unroutable ones BEFORE the user picks one. Discovering that a pair is
 * unquotable at submit time, after they have typed an amount and entered a
 * PIN, is the worst possible moment to find out.
 */
export async function listRoutesFrom(from: Currency): Promise<RouteAvailability[]> {
  try {
    const routes = await resolveRoutesFrom(from, CURRENCY_CODES);
    return routes.map((r) =>
      r.available
        ? { to: r.to, available: true, reason: null, customerRate: r.customerRate }
        : { to: r.to, available: false, reason: r.reason, customerRate: null },
    );
  } catch (err) {
    console.error("[convert.listRoutesFrom] failed", err);
    // A provider outage must not render every route "unavailable" with a
    // confident-sounding per-pair explanation it has no basis for.
    return CURRENCY_CODES.filter((c) => c !== from).map((to) => ({
      to,
      available: false,
      reason: "Rates are unavailable right now. Please try again in a moment.",
      customerRate: null,
    }));
  }
}

export interface ExecuteConversionState {
  error?: string;
  transactionId?: string;
}

export async function executeConversion(
  _prevState: ExecuteConversionState,
  formData: FormData,
): Promise<ExecuteConversionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const from = String(formData.get("from") ?? "") as Currency;
  const to = String(formData.get("to") ?? "") as Currency;
  const amount = Number(formData.get("amount"));
  const pin = String(formData.get("pin") ?? "").trim();

  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount." };
  if (from === to) return { error: "Pick two different wallets." };
  if (!pin) return { error: "Enter your transaction PIN." };

  // Re-resolved here, server-side, from scratch. Whatever rate the client was
  // showing is irrelevant — this is the rate that gets recorded and settled.
  let route: ConversionRoute;
  try {
    route = await resolveRoute(from, to);
  } catch (err) {
    return { error: toCustomerError(err, "convert.executeConversion") };
  }
  if (!route.available) return { error: route.reason };

  const sourceUsdtEquivalent = amount * route.sourceUsdtRate;
  if (sourceUsdtEquivalent < MINIMUM_USDT_EQUIVALENT) {
    return {
      error: `The minimum conversion is about ${MINIMUM_USDT_EQUIVALENT} USDT in ${from}.`,
    };
  }

  // The provider executes at its own real, unmarked rate. The customer is only
  // ever credited the marked-up figure, and the gap between the two is the
  // margin — which is why both are recorded on the row.
  let transfer: busha.BushaTransfer;
  try {
    const quote = await busha.createQuote({
      sourceCurrency: from,
      targetCurrency: to,
      sourceAmount: amount.toFixed(2),
    });
    transfer = await busha.createTransfer(quote.id);
  } catch (err) {
    return { error: toCustomerError(err, "convert.executeConversion") };
  }

  // The provider's OWN response amounts are what get recorded, never the
  // client's estimate and never our own pre-call arithmetic.
  const sourceAmount = Number(transfer.source_amount);
  const rawTargetAmount = Number(transfer.target_amount);
  const customerTargetAmount = applyMarkupToAmount(rawTargetAmount, route.markupRate);

  const { data: transactionId, error: rpcError } = await supabase.rpc("create_conversion", {
    p_source_currency: transfer.source_currency.toUpperCase() as Currency,
    p_target_currency: transfer.target_currency.toUpperCase() as Currency,
    p_source_amount: round2(sourceAmount),
    p_target_amount: round2(customerTargetAmount),
    p_provider_reference: transfer.id,
    p_provider_rate: route.providerRate,
    p_markup_rate: route.markupRate,
    p_customer_rate: route.customerRate,
    p_raw_target_amount: round2(rawTargetAmount),
    p_pin: pin,
  });

  if (rpcError) {
    // The provider transfer already happened but the ledger write did not —
    // the user's balance is untouched (create_conversion is what debits) while
    // the provider has moved funds inside our own account. That needs a human,
    // and it must be loud in the logs rather than a generic toast.
    console.error("[convert.executeConversion] transfer executed but ledger write failed", {
      userId: user.id,
      transferId: transfer.id,
      error: rpcError,
    });
    return { error: rpcError.message };
  }

  // Complete synchronously only on an unambiguous success status. The provider
  // enumerates several terminal states across its deposit/withdrawal/
  // conversion categories and the conversion ones are not fully confirmed, so
  // anything else is left pending for the webhook or the reconcile cron.
  // complete_conversion is idempotent, so a later call is always safe.
  if (
    transactionId &&
    (transfer.status === "funds_converted" || transfer.status === "funds_delivered")
  ) {
    const admin = createAdminClient();
    await admin.rpc("complete_conversion", { p_transaction_id: transactionId });
  }

  revalidatePath("/home");
  revalidatePath("/transactions");
  return { transactionId: transactionId ?? undefined };
}

export interface ConversionStatusState {
  status?: "pending" | "processing" | "completed" | "failed";
  error?: string;
}

/**
 * Poll target for the conversion confirmation screen.
 *
 * This checks the PROVIDER's status on every poll, not just our own column,
 * and self-heals. Neither the webhook nor the cron can be relied on to fire:
 * the provider's webhook has never once delivered to this kind of endpoint in
 * production for this account, and a platform cron needs an external scheduler
 * wired up before it runs at all. With this, the user is settled within one
 * poll cycle even when every other automated path is down.
 */
export async function checkConversionStatus(
  transactionId: string,
): Promise<ConversionStatusState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("transactions")
    .select("status, provider, provider_reference")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Transaction not found." };

  const settleable =
    (data.status === "pending" || data.status === "processing") &&
    data.provider === "busha" &&
    data.provider_reference;

  if (settleable) {
    try {
      const transfer = await busha.getTransfer(data.provider_reference!);
      const admin = createAdminClient();

      if (transfer.status === "funds_converted" || transfer.status === "funds_delivered") {
        const { error: completeError } = await admin.rpc("complete_conversion", {
          p_transaction_id: transactionId,
        });
        if (completeError) {
          console.error("[convert.checkConversionStatus] complete_conversion failed", {
            transactionId,
            error: completeError,
          });
        } else {
          revalidatePath("/home");
          revalidatePath("/transactions");
          return { status: "completed" };
        }
      } else if (transfer.status === "cancelled" || transfer.status === "funds_not_delivered") {
        const { error: failError } = await admin.rpc("fail_conversion", {
          p_transaction_id: transactionId,
          p_reason: `Provider reported ${transfer.status}`,
        });
        if (failError) {
          console.error("[convert.checkConversionStatus] fail_conversion failed", {
            transactionId,
            error: failError,
          });
        } else {
          revalidatePath("/home");
          revalidatePath("/transactions");
          return { status: "failed" };
        }
      }
    } catch (err) {
      // A transient provider error must not fail the poll — fall through and
      // report what our own row says, but log it so a persistent failure is
      // visible rather than silently absorbed on every tick.
      console.error("[convert.checkConversionStatus] provider lookup failed", {
        transactionId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  return { status: data.status };
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

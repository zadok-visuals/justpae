"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import * as busha from "@/lib/busha/client";
import { resolveRoute, resolveRoutesFrom, type ConversionRoute } from "@/lib/rates/routes";
import { applyMarkupToAmount } from "@/lib/rates/markup";
import { getMinimumConversionAmount } from "@/lib/busha/limits";
import { toCustomerError, toRpcError } from "@/lib/provider-error";
import { CURRENCY_CODES, formatAmount } from "@/lib/currencies";
import { isPinLockedError, isWrongPinError, resolvePinError } from "@/lib/pin";
import { notifyConversionCompleted } from "@/lib/notify/events";

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
 *
 *  3. And — since this file alone enforcing rule 1 was the whole problem — the
 *     figures are now written to a conversion_quotes row with the service role
 *     and the settlement function is given nothing but that row's id. Rule 1
 *     used to be a promise this file made on behalf of a function that
 *     `authenticated` could call directly, bypassing it. It is now a property
 *     of the schema. See supabase/migrations/0010 for the attack that was open.
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
  /** USDT-equivalent of the source amount, for diagnostics. */
  sourceUsdtEquivalent: number;
  belowMinimum: boolean;
  /**
   * The minimum in the SOURCE currency's own units, resolved server-side from
   * the same live rate the quote used. The client renders this rather than
   * recomputing, so the message and the server's gate are always the same
   * number.
   */
  minimumSourceAmount: number;
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
  const minimumSourceAmount = getMinimumConversionAmount(from, route.sourceUsdtRate);

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
      belowMinimum: sourceAmount < minimumSourceAmount,
      minimumSourceAmount,
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

  // Expressed in the currency the user is actually spending, from the same
  // helper the client uses with the same live rate — so the two can never
  // disagree about where the line is, and the message is a figure the user can
  // act on without doing an exchange-rate calculation in their head.
  const minimum = getMinimumConversionAmount(from, route.sourceUsdtRate);
  if (amount < minimum) {
    return { error: `The minimum conversion is ${formatAmount(from, minimum)}.` };
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

  // THE QUOTE ROW IS THE CONTRACT. Every figure that will end up on the ledger
  // row is written here, with the service role, by this server code — the
  // amounts the provider itself just reported, the rate trail resolved
  // server-side, and the provider reference of the transfer that was actually
  // created. create_conversion_from_quote then takes nothing but this row's id
  // and a PIN.
  //
  // This is what replaces passing eleven figures into an RPC that `authenticated`
  // could call directly. Previously a user could name their own target amount
  // and attach the reference of one of their own earlier completed transfers;
  // now there is no argument through which a figure can arrive.
  const admin = createAdminClient();

  const { data: quoteRow, error: quoteError } = await admin
    .from("conversion_quotes")
    .insert({
      user_id: user.id,
      source_currency: transfer.source_currency.toUpperCase() as Currency,
      target_currency: transfer.target_currency.toUpperCase() as Currency,
      source_amount: round2(sourceAmount),
      target_amount: round2(customerTargetAmount),
      provider_rate: route.providerRate,
      markup_rate: route.markupRate,
      customer_rate: route.customerRate,
      raw_target_amount: round2(rawTargetAmount),
      provider_reference: transfer.id,
      expires_at: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (quoteError || !quoteRow) {
    console.error("[convert.executeConversion] transfer executed but quote write failed", {
      userId: user.id,
      transferId: transfer.id,
      error: quoteError,
    });
    return { error: "Could not complete that conversion. Please contact support." };
  }

  const { data: transactionId, error: rpcError } = await admin.rpc(
    "create_conversion_from_quote",
    {
      // From the verified session, server-side — not from the form, and not
      // from auth.uid(), which is null on the service-role client.
      p_user_id: user.id,
      p_quote_id: quoteRow.id,
      p_pin: pin,
    },
  );

  if (rpcError) {
    // The provider transfer already happened but the ledger write did not —
    // the user's balance is untouched (the RPC is what debits) while the
    // provider has moved funds inside our own account. That needs a human, and
    // it must be loud in the logs rather than a generic toast.
    //
    // A wrong PIN is the common case here and is NOT an operational problem, so
    // it is handled first: resolvePinError counts the attempt (which has to
    // happen in a fresh transaction — see src/lib/pin.ts) and locks the PIN
    // after five.
    if (isWrongPinError(rpcError) || isPinLockedError(rpcError)) {
      return {
        error: await resolvePinError({ userId: user.id, email: user.email, error: rpcError }),
      };
    }

    console.error("[convert.executeConversion] transfer executed but ledger write failed", {
      userId: user.id,
      transferId: transfer.id,
      quoteId: quoteRow.id,
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
    await admin.rpc("complete_conversion", { p_transaction_id: transactionId });
    // Claimed, so the webhook and the reconciler cannot also announce this
    // one — see src/lib/notify/events.ts.
    await notifyConversionCompleted(transactionId);
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

  if (error) return { error: toRpcError(error, "convert") };
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
          // The poll is often the ONLY path that settles a conversion for this
          // provider (see this function's own comment on why), so it has to
          // notify too — the claim is what stops that from doubling up with
          // the webhook or the reconciler on the occasions they do fire.
          await notifyConversionCompleted(transactionId);
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

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
import { runConversion } from "@/lib/convert/sequence";

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

  const admin = createAdminClient();

  // ── THE ORDER IS THE FIX ─────────────────────────────────────────────────
  //
  // runConversion owns the sequence: hold, then provider, then record, with a
  // release on every path after the hold. It lives in src/lib/convert/
  // sequence.ts and is unit-tested there, because the bug this replaces was a
  // wrong ORDER rather than a wrong number — and an order is only testable
  // once it is separable from the Supabase and provider clients.
  //
  // Each step below is the real implementation of one of those; the test
  // injects fakes and asserts on call counts.
  const outcome = await runConversion<ConversionExecution, string>({
    // Checks suspension, the PIN, the destination wallet and the balance, and
    // debits the source wallet into a hold — one transaction, no provider.
    // Until this returns a hold id, nothing has been asked of anyone outside
    // this database. It used to run AFTER createQuote and createTransfer,
    // which is what let a wrong PIN execute a real transfer. See 0022.
    beginHold: async () => {
      const { data, error } = await admin.rpc("begin_conversion_hold", {
        p_user_id: user.id,
        p_source_currency: from,
        p_target_currency: to,
        p_source_amount: amount,
        p_pin: pin,
      });

      if (error) {
        // A wrong PIN is the common case and is NOT an operational problem.
        // resolvePinError counts the attempt — which has to happen in a fresh
        // transaction, see src/lib/pin.ts — and locks the PIN after five.
        if (isWrongPinError(error) || isPinLockedError(error)) {
          return {
            ok: false,
            error: await resolvePinError({ userId: user.id, email: user.email, error }),
            isPinError: true,
          };
        }
        return { ok: false, error: toRpcError(error, "convert") };
      }
      if (!data) return { ok: false, error: "Could not start that conversion." };
      return { ok: true, value: data };
    },

    // The provider executes at its own real, unmarked rate. The customer is
    // only ever credited the marked-up figure, and the gap between the two is
    // the margin — which is why both are recorded on the row.
    //
    // ONE LEG OR TWO, depending on the route. routes.ts has always PRICED a
    // fiat-to-fiat pair as a bridge through USDT, because the provider quotes
    // no direct pair between any two of our fiat currencies — but this used
    // to send a single createQuote(from, to) for it anyway, which the
    // provider rejects. The execution now matches the pricing.
    callProvider: () =>
      route.kind === "fiat_via_usdt"
        ? executeBridgedConversion({ from, to, amount, route })
        : executeSingleLeg({ from, to, amount }),

    // THE QUOTE ROW IS THE CONTRACT. Every figure that will end up on the
    // ledger row is written here, with the service role, by this server code
    // — the amount that was held, the target the provider itself just
    // reported, the rate trail resolved server-side, and the reference of the
    // transfer that was actually created. The settle step then takes nothing
    // but this row's id and the hold's: there is no argument through which a
    // figure can arrive from outside.
    writeQuote: async (execution) => {
      const { finalTransfer } = execution;
      const rawTargetAmount = Number(finalTransfer.target_amount);
      const customerTargetAmount = applyMarkupToAmount(rawTargetAmount, route.markupRate);

      // The SOURCE figure is the amount that was actually HELD, not the one
      // the provider echoes back. They are the same number in practice, but
      // if they ever diverge the ledger has to agree with the wallet: `amount`
      // is what left the user's balance, so `amount` is what the row says. A
      // divergence is a real operational signal, so it is logged rather than
      // quietly absorbed.
      //
      // Only meaningful for a single-leg conversion: on a bridged one the
      // final transfer's source is USDT, not the user's currency.
      const providerSourceAmount = Number(finalTransfer.source_amount);
      if (
        !execution.bridgeCurrency &&
        Number.isFinite(providerSourceAmount) &&
        round2(providerSourceAmount) !== round2(amount)
      ) {
        console.error("[convert.executeConversion] provider source amount differs from the held amount", {
          userId: user.id,
          transferId: finalTransfer.id,
          held: round2(amount),
          providerReported: round2(providerSourceAmount),
        });
      }

      const { data: quoteRow, error: quoteError } = await admin
        .from("conversion_quotes")
        .insert({
          user_id: user.id,
          source_currency: from,
          target_currency: to,
          source_amount: round2(amount),
          // On a partial there is no target delivery, but the row still
          // records what the conversion was FOR — the detail view shows the
          // intended target alongside what actually landed.
          target_amount: round2(customerTargetAmount),
          provider_rate: route.providerRate,
          markup_rate: route.markupRate,
          customer_rate: route.customerRate,
          raw_target_amount: round2(rawTargetAmount),
          // The primary reference is the leg that determines final delivery,
          // so the reconciler and the webhook keep pointing at the right one
          // without knowing how many legs there were.
          provider_reference: execution.leg2Reference ?? finalTransfer.id,
          bridge_currency: execution.bridgeCurrency ?? null,
          leg1_provider_reference: execution.leg1Reference ?? null,
          leg2_provider_reference: execution.leg2Reference ?? null,
          leg1_target_amount:
            execution.leg1CustomerAmount != null ? round2(execution.leg1CustomerAmount) : null,
          expires_at: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
        })
        .select("id")
        .single();

      if (quoteError || !quoteRow) {
        console.error("[convert.executeConversion] transfer executed but quote write failed", {
          userId: user.id,
          transferId: finalTransfer.id,
          error: quoteError,
        });
        return { ok: false, error: "Could not complete that conversion. Please contact support." };
      }

      return { ok: true, value: quoteRow.id };
    },

    // No second debit — the hold already took the money.
    settle: async (holdId, quoteId) => {
      const { data, error } = await admin.rpc("create_conversion_from_held_quote", {
        // From the verified session, server-side — not from the form, and not
        // from auth.uid(), which is null on the service-role client.
        p_user_id: user.id,
        p_hold_id: holdId,
        p_quote_id: quoteId,
      });

      if (error || !data) {
        // The provider transfer already happened but the ledger write did
        // not. That needs a human, and it must be loud in the logs rather
        // than a generic toast. The PIN is NOT a possible cause here any more
        // — it was verified before the hold — so there is no PIN branch.
        console.error("[convert.executeConversion] transfer executed but ledger write failed", {
          userId: user.id,
          quoteId,
          holdId,
          error,
        });
        return { ok: false, error: "Could not complete that conversion. Please contact support." };
      }

      return { ok: true, value: data };
    },

    release: (holdId, reason) => releaseHold(admin, holdId, user.id, reason),
    describeProviderError: (err) => toCustomerError(err, "convert.executeConversion"),
  });

  if (!outcome.ok) {
    // Every non-hold failure has already put the money back — runConversion
    // guarantees it, and sequence.test.ts is what keeps that true.
    revalidatePath("/home");
    return { error: outcome.error };
  }

  // Complete synchronously only on an unambiguous success status. The provider
  // enumerates several terminal states across its deposit/withdrawal/
  // conversion categories and the conversion ones are not fully confirmed, so
  // anything else is left pending for the webhook or the reconcile cron.
  // complete_conversion is idempotent, so a later call is always safe.
  if (
    outcome.transfer.status === "funds_converted" ||
    outcome.transfer.status === "funds_delivered"
  ) {
    await admin.rpc("complete_conversion", { p_transaction_id: outcome.transactionId });
    // Claimed, so the webhook and the reconciler cannot also announce this
    // one — see src/lib/notify/events.ts.
    await notifyConversionCompleted(outcome.transactionId);
  }

  revalidatePath("/home");
  revalidatePath("/transactions");
  return { transactionId: outcome.transactionId };
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

/**
 * Puts a hold's money back, and never throws.
 *
 * Every caller is already on a failure path. A release that threw would
 * replace a recoverable "the provider was down" with an unhandled exception,
 * and the user would get the generic error page instead of the real reason —
 * while the money stayed held either way. So the failure to release is logged
 * loudly and swallowed, and `expire_stale_conversion_holds` picks the hold up
 * from the cron fifteen minutes later. The user is made whole by one path or
 * the other.
 */
async function releaseHold(
  admin: ReturnType<typeof createAdminClient>,
  holdId: string,
  userId: string,
  reason: string,
): Promise<void> {
  const { error } = await admin.rpc("release_conversion_hold", {
    p_hold_id: holdId,
    p_user_id: userId,
    p_reason: reason.slice(0, 1000),
  });

  if (error) {
    console.error("[convert.releaseHold] COULD NOT RELEASE A HOLD — funds are held", {
      userId,
      holdId,
      reason,
      error,
    });
  }
}

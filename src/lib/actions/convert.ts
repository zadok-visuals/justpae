"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import * as busha from "@/lib/busha/client";
import { resolveRoute, resolveRoutesFrom, type ConversionRoute, type RouteKind } from "@/lib/rates/routes";
import {
  buyPriceFromFiatToUsdtRate,
  sellPriceFromUsdtToFiatRate,
  bridgeLegPrices,
} from "@/lib/rates/pairPricing";
import { applyMarkupToAmount } from "@/lib/rates/markup";
import { getMinimumConversionAmount } from "@/lib/busha/limits";
import { toCustomerError, toRpcError } from "@/lib/provider-error";
import { CURRENCY_CODES, formatAmount, isUsdPair, USD_CONVERSION_UNAVAILABLE } from "@/lib/currencies";
import { isPinLockedError, isWrongPinError, resolvePinError } from "@/lib/pin";
import { notifyConversionCompleted } from "@/lib/notify/events";
import { runConversion, type ProviderResult } from "@/lib/convert/sequence";
import { quoteCnyConversion } from "@/lib/cny/pricing";

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
  /**
   * Which shape of conversion this is, so the confirmation can name the rate
   * it is actually using rather than showing one unlabelled number.
   */
  kind: RouteKind;
  /**
   * The rate in the terms the customer reads it in — the same
   * local-per-1-USDT orientation as the rate board on Home, /convert and the
   * account pages, so the figure they agree to is recognisably the one they
   * were shown. See src/lib/rates/pairPricing.ts.
   *
   * A one-leg conversion fills exactly one of these (buying USDT fills
   * `buyPrice`, selling it fills `sellPrice`) and the figure is the
   * CUSTOMER's, markup included. A bridged fiat-to-fiat conversion fills both
   * with its two provider leg prices — one markup covers the whole journey,
   * and it is disclosed as its own row, so splitting it across the legs would
   * invent a second markup calculation. Either way these reconcile with the
   * composite `customerRate` the conversion settles at.
   */
  directionRates: {
    buyPrice: number | null;
    sellPrice: number | null;
    /** True when buyPrice/sellPrice are the two provider legs of a bridge. */
    bridged: boolean;
  };
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
    return { error: toCustomerError(err, "convert.quoteConversion", { currency: from, action: "conversion" }) };
  }

  if (!route.available) return { unavailableReason: route.reason };

  // A CNY pair is priced by the size ladder, not by the route's indicative
  // rate — see resolveCnyRoute, whose figures are a floor rather than a
  // price. This is where the real amount finally exists, so this is where the
  // real price is resolved.
  if (route.kind === "cny_ledger") return quoteCnyPair(from, to, amount, field);

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
      kind: route.kind,
      directionRates: directionRatesFor(route),
    },
  };
}

/**
 * A CNY conversion, priced.
 *
 * Separate from the provider path above because almost nothing is shared: no
 * pair lookup, no bridge, and a rate that depends on the size of the order.
 * What IS shared is the shape of the answer — the same ConversionQuote, with
 * the same expiry and the same minimum gate — so /convert renders a CNY
 * conversion with no idea that it is one.
 */
async function quoteCnyPair(
  from: Currency,
  to: Currency,
  amount: number,
  field: "source" | "target",
): Promise<QuoteState> {
  const direction = to === "CNY" ? "to_cny" : "from_cny";
  const nonCnyCurrency = to === "CNY" ? from : to;

  const quote = await quoteCnyConversion({
    direction,
    nonCnyCurrency,
    amount,
    amountSide: field,
  });

  if (!quote.available) return { unavailableReason: quote.reason };

  const minimumSourceAmount = getMinimumConversionAmount(from, quote.sourceUsdtRate);

  return {
    quote: {
      from,
      to,
      sourceAmount: quote.sourceAmount,
      targetAmount: quote.targetAmount,
      providerRate: quote.providerRate ?? quote.tierRate,
      markupRate: quote.markupRate,
      customerRate: quote.customerRate,
      expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
      sourceUsdtEquivalent: quote.sourceAmount * quote.sourceUsdtRate,
      belowMinimum: quote.sourceAmount < minimumSourceAmount,
      minimumSourceAmount,
      kind: "cny_ledger",
      // A yuan conversion has no USDT buy or sell price to show: the USDT leg
      // is internal plumbing, not something the customer trades at. The
      // confirmation falls back to the composite rate row, which for this
      // route is the only rate there is.
      directionRates: { buyPrice: null, sellPrice: null, bridged: false },
    },
  };
}

/**
 * The rate the confirmation shows, in the direction the user is going.
 *
 * Derived here, server-side, off the same resolved route that priced the
 * quote — never recomputed on the client from a rate it was handed, which
 * would let the two disagree about the number being agreed to.
 */
function directionRatesFor(
  route: Extract<ConversionRoute, { available: true }>,
): ConversionQuote["directionRates"] {
  if (route.kind === "fiat_to_usdt") {
    return {
      buyPrice: buyPriceFromFiatToUsdtRate(route.customerRate),
      sellPrice: null,
      bridged: false,
    };
  }

  if (route.kind === "usdt_to_fiat") {
    return {
      buyPrice: null,
      sellPrice: sellPriceFromUsdtToFiatRate(route.customerRate),
      bridged: false,
    };
  }

  // A yuan conversion reaches this function only if the branch above it in
  // quoteConversion is ever removed. It has no USDT buy or sell price to
  // show — the USDT leg is internal plumbing — and it is certainly not a
  // bridge, which is what the fall-through below would call it.
  if (route.kind === "cny_ledger") {
    return { buyPrice: null, sellPrice: null, bridged: false };
  }

  const legs = bridgeLegPrices(route);
  return {
    buyPrice: legs?.buyPrice ?? null,
    sellPrice: legs?.sellPrice ?? null,
    bridged: true,
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
    //
    // USD is the exception, and it is not a guess: its unavailability is a
    // standing fact about this account, not a symptom of the outage we just
    // caught. Telling a USD holder to "try again in a moment" during an
    // outage would be the one generic error this message exists to prevent.
    return CURRENCY_CODES.filter((c) => c !== from).map((to) => ({
      to,
      available: false,
      reason: isUsdPair(from, to)
        ? USD_CONVERSION_UNAVAILABLE
        : "Rates are unavailable right now. Please try again in a moment.",
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
    return { error: toCustomerError(err, "convert.executeConversion", { currency: from, action: "conversion" }) };
  }
  if (!route.available) return { error: route.reason };
  // Re-bound as a const so the narrowing survives into the step closures
  // below; a `let` that a closure captures is widened straight back.
  const liveRoute = route;

  // Expressed in the currency the user is actually spending, from the same
  // helper the client uses with the same live rate — so the two can never
  // disagree about where the line is, and the message is a figure the user can
  // act on without doing an exchange-rate calculation in their head.
  const minimum = getMinimumConversionAmount(from, route.sourceUsdtRate);
  if (amount < minimum) {
    return { error: `The minimum conversion is ${formatAmount(from, minimum)}.` };
  }

  const admin = createAdminClient();

  // A yuan conversion has no provider leg to order anything around, so it
  // takes a shorter path: hold, write the quote, settle — all three against
  // this database and nothing else. Branching here rather than inside
  // runConversion keeps that sequence's three guarantees about a provider
  // call meaning exactly what they say.
  if (liveRoute.kind === "cny_ledger") {
    return executeCnyConversion({ userId: user.id, email: user.email, from, to, amount, pin });
  }

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
      liveRoute.kind === "fiat_via_usdt"
        ? executeBridgedConversion({ from, to, amount, route: liveRoute })
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
      const customerTargetAmount = applyMarkupToAmount(rawTargetAmount, liveRoute.markupRate);

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
          provider_rate: liveRoute.providerRate,
          markup_rate: liveRoute.markupRate,
          customer_rate: liveRoute.customerRate,
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

    // Leg 1 converted and leg 2 did not. The row already owns the hold, so
    // the source is accounted for; what is left is to put the USDT leg 1
    // produced into the user's own wallet and mark the row for what it is.
    //
    // No amount crosses this boundary. The function reads leg1_target_amount
    // off the row — written above by writeQuote from the provider's own
    // leg-1 response, with the service role — which is the same rule every
    // other money function here follows since 0010.
    settlePartial: async (transactionId, reason) => {
      const { error } = await admin.rpc("partially_complete_conversion", {
        p_transaction_id: transactionId,
        p_reason: reason,
      });
      if (error) {
        // The user is owed USDT that has not landed. Nothing here can fix
        // that — a release would be wrong, since the source is gone — so it
        // has to be loud enough for a human to pick up.
        console.error(
          "[convert.executeConversion] COULD NOT CREDIT A COMPLETED FIRST LEG — user is owed USDT",
          { userId: user.id, transactionId, reason, error },
        );
      }
    },

    describeProviderError: (err) =>
      toCustomerError(err, "convert.executeConversion", { currency: from, action: "conversion" }),
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
  //
  // A "partial" is explicitly excluded: settlePartial has already moved that
  // row to partially_completed and credited the bridge currency, and
  // complete_conversion on top of it would credit the TARGET currency too —
  // for a delivery that never happened.
  if (
    outcome.outcome === "completed" &&
    isTransferDelivered(outcome.transfer.finalTransfer.status)
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

/**
 * A yuan conversion, executed.
 *
 * Three steps, one database, no provider:
 *
 *   1. begin_conversion_hold — suspension, PIN, destination wallet, balance,
 *      and the debit. The SAME function the provider path uses; nothing about
 *      it needed changing to accept a new currency, and reusing it is what
 *      guarantees a CNY conversion cannot skip a check the others make.
 *   2. The price, recomputed server-side from scratch, written to a
 *      conversion_quotes row with the service role. Whatever the browser was
 *      showing is irrelevant.
 *   3. settle_cny_conversion — writes the ledger row from that quote, credits
 *      the target wallet through complete_conversion, and consumes both the
 *      hold and the quote. Atomic.
 *
 * There is no "provider failed" path because there is no provider. The only
 * failure after the hold is this server's own, and it releases.
 */
async function executeCnyConversion(params: {
  userId: string;
  /** Only so a PIN lockout can be emailed, exactly as the provider path does. */
  email: string | null | undefined;
  from: Currency;
  to: Currency;
  amount: number;
  pin: string;
}): Promise<ExecuteConversionState> {
  const { userId, email, from, to, amount, pin } = params;
  const admin = createAdminClient();

  // Priced BEFORE the hold, deliberately: a pricing failure then costs the
  // user nothing and leaves nothing to release. The figures are recomputed
  // here rather than carried from the browser's quote — same rule as every
  // other money path in this file.
  const priced = await quoteCnyConversion({
    direction: to === "CNY" ? "to_cny" : "from_cny",
    nonCnyCurrency: to === "CNY" ? from : to,
    amount,
    amountSide: "source",
  });
  if (!priced.available) return { error: priced.reason };

  const minimum = getMinimumConversionAmount(from, priced.sourceUsdtRate);
  if (amount < minimum) {
    return { error: `The minimum conversion is ${formatAmount(from, minimum)}.` };
  }

  const { data: holdId, error: holdError } = await admin.rpc("begin_conversion_hold", {
    p_user_id: userId,
    p_source_currency: from,
    p_target_currency: to,
    p_source_amount: round2(amount),
    p_pin: pin,
  });

  if (holdError) {
    if (isWrongPinError(holdError) || isPinLockedError(holdError)) {
      return { error: await resolvePinError({ userId, email, error: holdError }) };
    }
    return { error: toRpcError(holdError, "convert") };
  }
  if (!holdId) return { error: "Could not start that conversion." };

  const { data: quoteRow, error: quoteError } = await admin
    .from("conversion_quotes")
    .insert({
      user_id: userId,
      source_currency: from,
      target_currency: to,
      source_amount: round2(amount),
      target_amount: priced.targetAmount,
      provider_rate: priced.providerRate ?? priced.tierRate,
      markup_rate: priced.markupRate,
      customer_rate: priced.customerRate,
      raw_target_amount: priced.rawTargetAmount,
      expires_at: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (quoteError || !quoteRow) {
    console.error("[convert.executeCnyConversion] quote write failed", { userId, error: quoteError });
    await releaseHold(admin, holdId, userId, "Quote write failed.");
    return { error: "Could not complete that conversion. Please try again." };
  }

  const { data: transactionId, error: settleError } = await admin.rpc("settle_cny_conversion", {
    p_user_id: userId,
    p_hold_id: holdId,
    p_quote_id: quoteRow.id,
  });

  if (settleError || !transactionId) {
    console.error("[convert.executeCnyConversion] settle failed", { userId, error: settleError });
    await releaseHold(admin, holdId, userId, "Ledger write failed.");
    return { error: toRpcError(settleError, "convert") };
  }

  // settle_cny_conversion completes the row in the same transaction, so the
  // notification is owed immediately rather than by a poll — and the claim in
  // notifyConversionCompleted is what stops it doubling up if any other path
  // ever reaches this row.
  await notifyConversionCompleted(transactionId);

  revalidatePath("/home");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  return { transactionId };
}

export interface ConversionStatusState {
  /**
   * "partially_completed" is a real outcome, not an error state: leg 1 of a
   * bridged conversion converted and leg 2 did not, so the user holds USDT
   * instead of the currency they asked for. The confirmation screen has to be
   * able to say that rather than rounding it to "failed", which would be a
   * lie about where the money went.
   */
  status?: "pending" | "processing" | "completed" | "failed" | "partially_completed";
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
      } else if (isTransferFailed(transfer.status)) {
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
          // NOT necessarily "failed". fail_conversion REDIRECTS to
          // partially_complete_conversion when the row's leg1_target_amount
          // is set (migration 0024) — a two-leg row whose first leg converted
          // ends up partially_completed with USDT credited, because refunding
          // its source would pay the user twice. The caller must be told what
          // actually happened, so the row is re-read rather than assumed.
          return { status: await readConversionStatus(transactionId, user.id) };
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
 * Re-reads a conversion row's status after a settlement function ran.
 *
 * Needed because fail_conversion does not always produce 'failed': 0024 has
 * it redirect a row whose first leg converted into
 * partially_complete_conversion instead. The RPC returns void, so the row
 * itself is the only honest source of what the outcome was.
 *
 * Falls back to "failed" only when the row cannot be re-read at all — the RPC
 * did report success, so something terminal did happen, and claiming it is
 * still pending would leave the poller spinning forever.
 */
async function readConversionStatus(
  transactionId: string,
  userId: string,
): Promise<NonNullable<ConversionStatusState["status"]>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("transactions")
    .select("status")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    console.error("[convert.readConversionStatus] could not re-read the settled row", {
      transactionId,
      error,
    });
    return "failed";
  }

  return data.status as NonNullable<ConversionStatusState["status"]>;
}

/**
 * What the provider step hands to writeQuote.
 *
 * One shape for both route shapes, so writeQuote never branches on how many
 * legs ran. A single-leg conversion simply leaves every leg field null, and
 * `bridge_currency is null` is exactly the condition migration 0024's
 * partially_complete_conversion refuses on — a row with no bridge has no
 * intermediate holding to credit, so it can only ever fail and refund.
 */
interface ConversionExecution {
  /**
   * The leg that determines final delivery: leg 2 on a bridged conversion,
   * the only transfer on a single-leg one. Its target_amount is what the
   * customer was converting INTO, and its status is what the poller, the
   * webhook and the reconciler all read.
   */
  finalTransfer: busha.BushaTransfer;
  /** "USDT" on a bridged conversion, null on a single leg. */
  bridgeCurrency: Currency | null;
  leg1Reference: string | null;
  leg2Reference: string | null;
  /**
   * The markup-adjusted USDT leg 1 actually delivered. This is the figure
   * partially_complete_conversion credits off the row, so it is real money:
   * it is taken from the provider's own leg-1 response and never from
   * anything the client sent.
   */
  leg1CustomerAmount: number | null;
}

/**
 * Terminal success for a conversion transfer.
 *
 * Busha enumerates its statuses across deposit, withdrawal and conversion
 * categories in one union, so most of them cannot occur here. These two are
 * the conversion ones that mean the money arrived, and they are the same pair
 * executeConversion, checkConversionStatus, the webhook and the reconciler all
 * already treat as settled — kept in one place so the four cannot drift.
 */
function isTransferDelivered(status: busha.BushaTransfer["status"]): boolean {
  return status === "funds_converted" || status === "funds_delivered";
}

/** Terminal failure. Anything else is still in flight. */
function isTransferFailed(status: busha.BushaTransfer["status"]): boolean {
  return (
    status === "cancelled" || status === "funds_not_delivered" || status === "funds_refunded"
  );
}

/** How long leg 1 is given to land before leg 2 can spend what it produced. */
const LEG1_POLL_ATTEMPTS = 8;
const LEG1_POLL_INTERVAL_MS = 1_500;

/**
 * The ORIGINAL single-leg path: fiat <-> USDT, which the provider does quote
 * as a direct pair. Unchanged in behaviour from before the two-leg split —
 * one quote, one transfer, no bridge.
 *
 * It does NOT wait for a terminal status. A single-leg conversion that is
 * still in flight is left pending and settled later by the poll, the webhook
 * or the reconciler, exactly as it always was; there is no second leg waiting
 * on it, so there is nothing to wait for.
 */
async function executeSingleLeg(params: {
  from: Currency;
  to: Currency;
  amount: number;
}): Promise<ProviderResult<ConversionExecution>> {
  const providerQuote = await busha.createQuote({
    sourceCurrency: params.from,
    targetCurrency: params.to,
    sourceAmount: params.amount.toFixed(2),
  });
  const transfer = await busha.createTransfer(providerQuote.id);

  return {
    outcome: "completed",
    transfer: {
      finalTransfer: transfer,
      bridgeCurrency: null,
      leg1Reference: null,
      leg2Reference: null,
      leg1CustomerAmount: null,
    },
  };
}

/**
 * fiat -> USDT -> fiat, because the provider quotes no direct pair between any
 * two of our fiat currencies. routes.ts has always PRICED this pair this way;
 * this is the execution finally matching the pricing.
 *
 * The three outcomes, and which one happens is the whole point of the design:
 *
 *   leg 1 throws / fails   THROW. Nothing moved, so runConversion releases the
 *                          hold and the user's source currency comes straight
 *                          back. Indistinguishable from a single-leg failure.
 *   leg 2 throws / fails   RETURN "partial". Leg 1 really converted the source
 *                          into USDT; that USDT exists. Releasing would refund
 *                          a source the user no longer has a claim to while
 *                          the USDT stayed with us — paying out twice. The row
 *                          settles and the USDT is credited instead.
 *   both succeed           RETURN "completed" on leg 2's transfer.
 */
async function executeBridgedConversion(params: {
  from: Currency;
  to: Currency;
  amount: number;
  /** The resolved route, for the markup. Narrowed to the available shape. */
  route: Extract<ConversionRoute, { available: true }>;
}): Promise<ProviderResult<ConversionExecution>> {
  const { from, to, amount, route } = params;

  // ── Leg 1: source fiat -> USDT ───────────────────────────────────────────
  // Any throw here propagates untouched. That is correct: nothing has moved,
  // and runConversion's catch is the release path.
  const leg1Quote = await busha.createQuote({
    sourceCurrency: from,
    targetCurrency: "USDT",
    sourceAmount: amount.toFixed(2),
  });
  let leg1 = await busha.createTransfer(leg1Quote.id);

  // Leg 2 SPENDS what leg 1 produced, so unlike a single-leg conversion this
  // one cannot be left to settle in the background — the USDT has to exist
  // before it can be sold. Wait for a terminal status.
  leg1 = await awaitTerminalTransfer(leg1);

  if (!isTransferDelivered(leg1.status)) {
    // Includes the "still in flight when the budget ran out" case. Releasing
    // the hold is the right call for the USER either way — they are made whole
    // — but a leg 1 that lands AFTER this point leaves USDT sitting on the
    // business's own provider balance with no row pointing at it. That is a
    // reconciliation job for a human, so it is logged as loudly as a failure.
    console.error("[convert.executeBridgedConversion] leg 1 did not deliver — releasing", {
      from,
      to,
      amount,
      leg1Reference: leg1.id,
      leg1Status: leg1.status,
      stillInFlight: !isTransferFailed(leg1.status),
    });
    throw new busha.BushaError(
      `Conversion leg 1 (${from} to USDT) reported ${leg1.status}`,
      502,
    );
  }

  // What leg 1 ACTUALLY delivered, from its own response — never recomputed
  // from a rate, because the rate that was quoted and the rate that executed
  // are allowed to differ and the provider's figure is the true one.
  const leg1RawUsdt = Number(leg1.target_amount);
  if (!Number.isFinite(leg1RawUsdt) || leg1RawUsdt <= 0) {
    throw new busha.BushaError("Conversion leg 1 delivered no USDT", 502);
  }

  // ONE markup across the whole journey, not one per leg. route.markupRate is
  // the markup for the (from, to) pair the customer was quoted, and writeQuote
  // applies that same single rate to the final delivery. Applying it again on
  // the bridge would charge the customer twice for one conversion; applying a
  // different one would mean the USDT they are credited on a partial was
  // priced on a basis they were never shown.
  const leg1CustomerAmount = applyMarkupToAmount(leg1RawUsdt, route.markupRate);

  // ── Leg 2: USDT -> target fiat ───────────────────────────────────────────
  // From here on, money HAS moved. Every failure below returns "partial"
  // rather than throwing, and the user ends up holding the USDT.
  try {
    const leg2Quote = await busha.createQuote({
      sourceCurrency: "USDT",
      targetCurrency: to,
      // The provider's own leg-1 delivery is what there is to spend. Spending
      // the marked-up figure would try to sell USDT we do not have.
      sourceAmount: leg1RawUsdt.toFixed(2),
    });
    const leg2 = await busha.createTransfer(leg2Quote.id);

    const execution: ConversionExecution = {
      finalTransfer: leg2,
      bridgeCurrency: "USDT",
      leg1Reference: leg1.id,
      leg2Reference: leg2.id,
      leg1CustomerAmount,
    };

    // Leg 2 is allowed to still be in flight — that is an ordinary pending
    // conversion, and the poll, the webhook and the reconciler all settle it.
    // Only an explicit terminal failure is a partial.
    if (isTransferFailed(leg2.status)) {
      return {
        outcome: "partial",
        transfer: execution,
        error: new Error(`Conversion leg 2 (USDT to ${to}) reported ${leg2.status}`),
      };
    }

    return { outcome: "completed", transfer: execution };
  } catch (err) {
    // Leg 2 never got off the ground. Leg 1's own transfer is the one that
    // really happened, so it becomes the final transfer on the row — there is
    // no leg 2 reference to point anything at.
    console.error("[convert.executeBridgedConversion] leg 2 failed after leg 1 converted", {
      from,
      to,
      leg1Reference: leg1.id,
      leg1CustomerAmount,
      error: err instanceof Error ? err.message : err,
    });
    return {
      outcome: "partial",
      transfer: {
        finalTransfer: leg1,
        bridgeCurrency: "USDT",
        leg1Reference: leg1.id,
        leg2Reference: null,
        leg1CustomerAmount,
      },
      error: err,
    };
  }
}

/**
 * Polls a transfer until it is terminal, or until the budget runs out.
 *
 * Returns the freshest transfer it managed to read, terminal or not — the
 * caller decides what a non-terminal one means. A lookup that throws is not
 * fatal here: the last known transfer is returned instead, and the caller's
 * own status check handles it.
 */
async function awaitTerminalTransfer(transfer: busha.BushaTransfer): Promise<busha.BushaTransfer> {
  let latest = transfer;

  for (let attempt = 0; attempt < LEG1_POLL_ATTEMPTS; attempt += 1) {
    if (isTransferDelivered(latest.status) || isTransferFailed(latest.status)) return latest;
    await new Promise((resolve) => setTimeout(resolve, LEG1_POLL_INTERVAL_MS));
    try {
      latest = await busha.getTransfer(latest.id);
    } catch (err) {
      console.error("[convert.awaitTerminalTransfer] lookup failed", {
        transferId: latest.id,
        error: err instanceof Error ? err.message : err,
      });
      return latest;
    }
  }

  return latest;
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

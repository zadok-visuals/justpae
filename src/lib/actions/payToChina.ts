"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOwnedUpload } from "@/lib/storage/verifyUpload";
import { quoteCnyConversion, cnyRouteBlocker } from "@/lib/cny/pricing";
import { getMinimumConversionAmount } from "@/lib/busha/limits";
import { formatAmount, isCurrency } from "@/lib/currencies";
import { isPinLockedError, isWrongPinError, resolvePinError } from "@/lib/pin";
import { toRpcError } from "@/lib/provider-error";
import { notifyPayToChinaSubmitted } from "@/lib/notify/events";
import type { Currency, PayoutMethod } from "@/lib/types/database";

/**
 * Pay to China — the server side.
 *
 * WHAT THIS IS. A customer pays a supplier, a landlord or a family member in
 * China. No provider in this stack can do that, so a person on our side makes
 * the payment by hand and photographs the receipt. Everything here exists to
 * make a manual payout behave like an automated one from the customer's side:
 * a firm price, money that is accounted for the moment it leaves, a status
 * that moves, and a refund that is part of a rejection rather than a follow-up
 * someone has to remember.
 *
 * THE THREE RULES THIS FILE ENFORCES, and the reason each one is here rather
 * than in the form:
 *
 *  1. THE CNY FIGURE IS COMPUTED HERE AND WRITTEN TO A QUOTE ROW. The browser
 *     shows a live estimate; it never sends one. The function that creates the
 *     request is given the quote's ID and reads every figure off it, so there
 *     is no argument through which an amount can arrive from outside. The
 *     implementation this is ported from takes p_target_cny from an
 *     authenticated caller, which means a signed-in user can name the yuan
 *     they are credited with.
 *
 *  2. PIN, SUSPENSION, KYC AND BALANCE ARE CHECKED BEFORE THE DEBIT, in one
 *     database transaction with it. There is no provider call to sequence
 *     around, which makes this strictly stronger than the hold-and-release
 *     pattern the conversion path needs.
 *
 *  3. THE RECIPIENT MUST BELONG TO THE USER, checked in SQL rather than here.
 *     A recipient id is a uuid in a form field; treating ownership as a UI
 *     concern is how one customer's money pays another customer's vendor.
 */

const QUOTE_TTL_SECONDS = 120;

export interface PayToChinaEstimate {
  cnyAmount?: number;
  sourceAmount?: number;
  minimumSourceAmount?: number;
  belowMinimum?: boolean;
  /** ISO timestamp — the form counts down to it. */
  expiresAt?: string;
  error?: string;
  unavailableReason?: string;
}

/**
 * The live "about ¥X to your recipient" figure.
 *
 * Priced on the server on every change, debounced by the form, because the
 * yuan rate depends on the SIZE of the order (the ladder in
 * src/lib/cny/tiers.ts) and on a live provider rate for the fiat leg. A
 * client-side estimate would need both the ladder — which a customer session
 * cannot read, by design — and the live rate.
 *
 * Writes nothing. The quote row is created at submit, not here: a row per
 * keystroke would fill the table with prices nobody accepted.
 */
export async function estimatePayToChina(params: {
  sourceCurrency: Currency;
  amount: number;
}): Promise<PayToChinaEstimate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { sourceCurrency, amount } = params;
  if (!isCurrency(sourceCurrency)) return { error: "Pick a wallet to pay from." };
  if (!Number.isFinite(amount) || amount <= 0) return {};

  // Paying FROM the CNY wallet is the simple case: the yuan is already bought
  // and there is nothing to price. The recipient gets what is sent.
  if (sourceCurrency === "CNY") {
    const minimum = getMinimumConversionAmount("CNY");
    return {
      cnyAmount: amount,
      sourceAmount: amount,
      minimumSourceAmount: minimum,
      belowMinimum: amount < minimum,
      expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
    };
  }

  const blocker = cnyRouteBlocker(sourceCurrency);
  if (blocker) return { unavailableReason: blocker };

  const quote = await quoteCnyConversion({
    direction: "to_cny",
    nonCnyCurrency: sourceCurrency,
    amount,
    amountSide: "source",
  });
  if (!quote.available) return { unavailableReason: quote.reason };

  const minimum = getMinimumConversionAmount(sourceCurrency, quote.sourceUsdtRate);

  return {
    cnyAmount: quote.targetAmount,
    sourceAmount: quote.sourceAmount,
    minimumSourceAmount: minimum,
    belowMinimum: quote.sourceAmount < minimum,
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

export interface PayToChinaState {
  error?: string;
  transactionId?: string;
}

const GENERIC_SUBMIT_ERROR =
  "We couldn't submit that request. Please check the details and try again.";

/**
 * Submit a request.
 *
 * Order matters and is deliberate:
 *
 *   1. validate the shape of what was typed  (free, and refuses most mistakes)
 *   2. verify the QR upload belongs to this user (before any row records it)
 *   3. price it, server-side                 (nothing created yet, so nothing
 *                                             to clean up if this fails)
 *   4. write the recipient snapshot
 *   5. write the quote row with the service role
 *   6. one atomic SQL call: PIN, suspension, KYC, balance, debit, ledger row
 *
 * Steps 4 and 5 are the only ones that leave anything behind on a later
 * failure, and both are cleaned up below — an orphaned recipient row would
 * otherwise show up in the user's saved list as a half-made request.
 */
export async function submitPayToChina(
  _prevState: PayToChinaState,
  formData: FormData,
): Promise<PayToChinaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const payoutMethod = String(formData.get("payoutMethod") ?? "") as PayoutMethod;
  const sourceCurrency = String(formData.get("sourceCurrency") ?? "") as Currency;
  const amount = Number(formData.get("amount"));
  const pin = String(formData.get("pin") ?? "").trim();
  // The browser uploads the QR straight into its own folder in the private
  // bucket; only the path string arrives here. Same fix, for the same reason,
  // as the KYC uploads — see src/lib/storage/clientUpload.ts.
  const qrCodePath = String(formData.get("qrCodePath") ?? "").trim();
  const saveLabel = String(formData.get("saveLabel") ?? "").trim();
  const shouldSave = formData.get("saveRecipient") === "on" && saveLabel.length > 0;

  if (!["alipay", "wechat", "bank"].includes(payoutMethod)) {
    return { error: "Choose how your recipient should be paid." };
  }
  if (!isCurrency(sourceCurrency)) return { error: "Pick a wallet to pay from." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount." };
  if (!pin) return { error: "Enter your transaction PIN." };

  // ── 2. The QR upload, verified before anything references it ─────────────
  let qrCodeRef: string | null = null;
  if (qrCodePath) {
    const ok = await verifyOwnedUpload(supabase, "pay-to-china-qr", user.id, qrCodePath);
    if (!ok) {
      return { error: "We couldn't verify that QR code. Please upload it again." };
    }
    qrCodeRef = qrCodePath;
  }

  // ── The recipient fields, by method ──────────────────────────────────────
  const recipient: Record<string, string | null> = {
    user_id: user.id,
    payout_method: payoutMethod,
    qr_code_ref: qrCodeRef,
  };

  if (payoutMethod === "alipay" || payoutMethod === "wechat") {
    const firstName = String(formData.get("recipientFirstName") ?? "").trim();
    const lastName = String(formData.get("recipientLastName") ?? "").trim();
    if (!firstName || !lastName) {
      return { error: "We need your recipient's first and last name." };
    }
    const handle = String(
      formData.get(payoutMethod === "alipay" ? "recipientAlipayId" : "recipientWechatId") ?? "",
    ).trim();
    // A QR CODE ALONE IS ENOUGH. Most people paying a Chinese vendor are sent
    // a QR screenshot and have no idea what the account behind it is called;
    // demanding a typed handle as well turns the common case into a dead end.
    if (!handle && !qrCodeRef) {
      return {
        error: "Add your recipient's phone number or email, or upload their QR code.",
      };
    }
    recipient.recipient_first_name = firstName;
    recipient.recipient_last_name = lastName;
    if (payoutMethod === "alipay") recipient.recipient_alipay_id = handle || null;
    else recipient.recipient_wechat_id = handle || null;
  } else {
    const accountNumber = String(formData.get("recipientBankAccountNumber") ?? "").trim();
    const bankName = String(formData.get("recipientBankName") ?? "").trim();
    const accountHolder = String(formData.get("recipientAccountHolderName") ?? "").trim();
    if (!accountNumber || !bankName || !accountHolder) {
      return { error: "A bank payment needs the bank, the account number and the account name." };
    }
    recipient.recipient_bank_account_number = accountNumber;
    recipient.recipient_bank_name = bankName;
    recipient.recipient_account_holder_name = accountHolder;
  }

  // ── 3. The price, server-side ────────────────────────────────────────────
  const priced = await priceRequest(sourceCurrency, amount);
  if ("error" in priced) return { error: priced.error };

  // ── 4. The recipient snapshot ────────────────────────────────────────────
  const { data: recipientRow, error: recipientError } = await supabase
    .from("pay_to_china_recipients")
    .insert(recipient as never)
    .select("id")
    .single();

  if (recipientError || !recipientRow) {
    // Never the database's own text: a constraint name tells the customer
    // nothing and tells anyone else more about the schema than they should
    // have. The real thing goes to the log.
    console.error("[payToChina.submit] recipient insert failed", {
      userId: user.id,
      error: recipientError,
    });
    return { error: GENERIC_SUBMIT_ERROR };
  }

  const admin = createAdminClient();

  // ── 5. The quote row, with the service role ──────────────────────────────
  const { data: quoteRow, error: quoteError } = await admin
    .from("pay_to_china_quotes")
    .insert({
      user_id: user.id,
      source_currency: sourceCurrency,
      source_amount: priced.sourceAmount,
      target_cny: priced.targetCny,
      provider_rate: priced.providerRate,
      tier_rate: priced.tierRate,
      markup_rate: priced.markupRate,
      raw_target_cny: priced.rawTargetCny,
      expires_at: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (quoteError || !quoteRow) {
    console.error("[payToChina.submit] quote write failed", { userId: user.id, error: quoteError });
    await admin.from("pay_to_china_recipients").delete().eq("id", recipientRow.id);
    return { error: GENERIC_SUBMIT_ERROR };
  }

  // ── 6. One atomic call ───────────────────────────────────────────────────
  const { data: transactionId, error: rpcError } = await admin.rpc("create_pay_to_china_request", {
    p_user_id: user.id,
    p_quote_id: quoteRow.id,
    p_recipient_id: recipientRow.id,
    p_pin: pin,
  });

  if (rpcError || !transactionId) {
    // The recipient row is orphaned now — nothing points at it and nothing
    // ever will, since create_pay_to_china_request only accepts an unattached
    // one. Left behind it would surface as a phantom request.
    await admin.from("pay_to_china_recipients").delete().eq("id", recipientRow.id);

    if (rpcError && (isWrongPinError(rpcError) || isPinLockedError(rpcError))) {
      return {
        error: await resolvePinError({ userId: user.id, email: user.email, error: rpcError }),
      };
    }
    return { error: rpcError ? toRpcError(rpcError, "pay to China") : GENERIC_SUBMIT_ERROR };
  }

  // ── Saved recipient, best effort ─────────────────────────────────────────
  // A failure here must never fail a payment that has already been taken.
  if (shouldSave) {
    const { error: saveError } = await supabase
      .from("saved_pay_to_china_recipients")
      .insert({ ...recipient, label: saveLabel } as never);
    if (saveError) {
      console.error("[payToChina.submit] saving the recipient failed", {
        userId: user.id,
        error: saveError,
      });
    }
  }

  await notifyPayToChinaSubmitted(transactionId);

  revalidatePath("/home");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/pay-to-china");
  return { transactionId };
}

/**
 * The figures, resolved once, server-side.
 *
 * A CNY-funded request is deliberately NOT priced: the yuan was already
 * bought when the user converted into their CNY wallet, at a rate they were
 * shown then. Re-pricing it here would apply the markup twice to the same
 * money.
 */
async function priceRequest(
  sourceCurrency: Currency,
  amount: number,
): Promise<
  | {
      sourceAmount: number;
      targetCny: number;
      providerRate: number | null;
      tierRate: number | null;
      markupRate: number | null;
      rawTargetCny: number;
    }
  | { error: string }
> {
  if (sourceCurrency === "CNY") {
    const minimum = getMinimumConversionAmount("CNY");
    if (amount < minimum) {
      return { error: `The smallest payment we can send is ${formatAmount("CNY", minimum)}.` };
    }
    return {
      sourceAmount: Number(amount.toFixed(2)),
      targetCny: Number(amount.toFixed(2)),
      providerRate: null,
      tierRate: null,
      markupRate: null,
      rawTargetCny: Number(amount.toFixed(2)),
    };
  }

  const quote = await quoteCnyConversion({
    direction: "to_cny",
    nonCnyCurrency: sourceCurrency,
    amount,
    amountSide: "source",
  });
  if (!quote.available) return { error: quote.reason };

  const minimum = getMinimumConversionAmount(sourceCurrency, quote.sourceUsdtRate);
  if (quote.sourceAmount < minimum) {
    return { error: `The smallest payment we can send is ${formatAmount(sourceCurrency, minimum)}.` };
  }

  return {
    sourceAmount: quote.sourceAmount,
    targetCny: quote.targetAmount,
    providerRate: quote.providerRate,
    tierRate: quote.tierRate,
    markupRate: quote.markupRate,
    rawTargetCny: quote.rawTargetAmount,
  };
}

/** Forget a saved recipient. RLS limits the delete to the caller's own rows. */
export async function deleteSavedPayToChinaRecipient(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("saved_pay_to_china_recipients")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: "We couldn't remove that recipient. Please try again." };
  revalidatePath("/pay-to-china");
  return {};
}

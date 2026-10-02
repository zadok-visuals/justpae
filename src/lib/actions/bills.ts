"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillCategory, Currency } from "@/lib/types/database";
import { billersFor, findBiller, resolveProvider } from "@/lib/providers/bills";
import { toCustomerError } from "@/lib/provider-error";

/**
 * Bill payments.
 *
 * The flow is debit first, then pay the provider, then either complete or
 * refund — the same shape every other money path here uses. The debit happens
 * inside create_bill_payment with the wallet row locked, so two simultaneous
 * submissions cannot both succeed against the same balance.
 *
 * The provider is unconfirmed, so resolveProvider() returns null and
 * payBill refuses before debiting anything. Nothing here is stubbed as
 * "pretend it worked": a bill that reports success without a provider having
 * been paid is worse than a bill that honestly refuses.
 */

export async function listBillers(country: string, category: BillCategory) {
  const provider = resolveProvider();
  if (provider) {
    try {
      return await provider.listBillers({ country, category });
    } catch (err) {
      console.error("[bills.listBillers] provider lookup failed, using catalogue", err);
    }
  }
  // The static catalogue holds the real billers and networks for each country,
  // so the flow is reviewable and the UI is complete before a provider exists.
  return billersFor(country, category);
}

export interface ValidateCustomerState {
  customerName?: string | null;
  outstandingAmount?: number | null;
  error?: string;
  /** True when this biller has no name lookup at all, which is not an error. */
  unsupported?: boolean;
}

export async function validateBillCustomer(
  billerCode: string,
  customerIdentifier: string,
): Promise<ValidateCustomerState> {
  const biller = findBiller(billerCode);
  if (!biller) return { error: "Unknown biller." };
  if (!biller.supportsNameValidation) return { unsupported: true };
  if (!customerIdentifier.trim()) return { error: "Enter the customer number." };

  const provider = resolveProvider();
  if (!provider) {
    // No provider, so no lookup is possible. This is reported as unsupported
    // rather than as a failure, because the user has done nothing wrong and
    // the review step still works without a name.
    return { unsupported: true };
  }

  try {
    const result = await provider.validateCustomer({
      biller,
      customerIdentifier: customerIdentifier.trim(),
    });
    if (result.error) return { error: result.error };
    return {
      customerName: result.customerName,
      outstandingAmount: result.outstandingAmount ?? null,
    };
  } catch (err) {
    return { error: toCustomerError(err, "bills.validateBillCustomer") };
  }
}

export interface PayBillState {
  error?: string;
  billPaymentId?: string;
  token?: string | null;
  units?: string | null;
  pending?: boolean;
}

export async function payBill(
  _prevState: PayBillState,
  formData: FormData,
): Promise<PayBillState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const billerCode = String(formData.get("billerCode") ?? "");
  const customerIdentifier = String(formData.get("customerIdentifier") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim() || null;
  const amount = Number(formData.get("amount"));
  const currency = String(formData.get("currency") ?? "") as Currency;
  const pin = String(formData.get("pin") ?? "").trim();
  const saveBeneficiary = formData.get("saveBeneficiary") === "on";
  const beneficiaryLabel = String(formData.get("beneficiaryLabel") ?? "").trim();

  const biller = findBiller(billerCode);
  if (!biller) return { error: "Unknown biller." };
  if (!customerIdentifier) return { error: `Enter the ${biller.identifierLabel.toLowerCase()}.` };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount." };
  if (biller.minAmount && amount < biller.minAmount) {
    return { error: `The minimum for ${biller.name} is ${biller.minAmount}.` };
  }
  if (biller.maxAmount && amount > biller.maxAmount) {
    return { error: `The maximum for ${biller.name} is ${biller.maxAmount}.` };
  }
  if (!pin) return { error: "Enter your transaction PIN." };

  const provider = resolveProvider();
  if (!provider) {
    // Checked BEFORE the debit. Debiting and then discovering there is nothing
    // to pay would mean a refund for every single attempt.
    return {
      error: "Bill payments are coming soon — we're finishing setup with our biller partner.",
    };
  }

  const { data: billPaymentId, error: rpcError } = await supabase.rpc("create_bill_payment", {
    p_category: biller.category,
    p_country: biller.country,
    p_biller_code: biller.code,
    p_biller_name: biller.name,
    p_customer_identifier: customerIdentifier,
    p_customer_name: customerName,
    p_amount: amount,
    p_currency: currency,
    p_fee: 0,
    p_provider: provider.name,
    p_pin: pin,
  });

  if (rpcError) return { error: rpcError.message };
  if (!billPaymentId) return { error: "Could not start that payment. Please try again." };

  const admin = createAdminClient();

  try {
    const result = await provider.pay({
      biller,
      customerIdentifier,
      amount,
      currency,
      // Our own row id doubles as the provider idempotency key, so a retried
      // call cannot pay twice.
      reference: billPaymentId,
    });

    await admin.rpc("complete_bill_payment", {
      p_bill_payment_id: billPaymentId,
      p_provider_reference: result.providerReference,
      p_token: result.token,
      p_units: result.units,
    });

    if (saveBeneficiary) await saveBillBeneficiary(supabase, user.id, biller, customerIdentifier, beneficiaryLabel);

    revalidatePath("/home");
    revalidatePath("/transactions");
    return {
      billPaymentId,
      token: result.token,
      units: result.units,
      pending: result.pending,
    };
  } catch (err) {
    // The debit already happened, so a provider failure MUST refund. Leaving
    // it debited is the one outcome that is never acceptable.
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[bills.payBill] provider failed, refunding", { billPaymentId, reason });
    await admin.rpc("refund_bill_payment", {
      p_bill_payment_id: billPaymentId,
      p_reason: reason.slice(0, 1000),
    });
    revalidatePath("/home");
    revalidatePath("/transactions");
    return { error: toCustomerError(err, "bills.payBill") };
  }
}

async function saveBillBeneficiary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  biller: { code: string; name: string; category: BillCategory; country: string },
  customerIdentifier: string,
  label: string,
) {
  // Beneficiaries hold no money, so the user writes them directly under RLS
  // rather than through a function. A duplicate is a no-op, not an error — the
  // unique constraint exists so repeat payments to the same number don't pile
  // up identical rows.
  const { error } = await supabase.from("bill_beneficiaries").upsert(
    {
      user_id: userId,
      label: label || `${biller.name} — ${customerIdentifier}`,
      category: biller.category,
      country: biller.country,
      biller_code: biller.code,
      biller_name: biller.name,
      customer_identifier: customerIdentifier,
    },
    { onConflict: "user_id,category,biller_code,customer_identifier" },
  );
  if (error) {
    // A failed save must not fail the payment that already succeeded.
    console.error("[bills.saveBillBeneficiary] failed", error);
  }
}

export async function deleteBillBeneficiary(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("bill_beneficiaries").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/bills");
}

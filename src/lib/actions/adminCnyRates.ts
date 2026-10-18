"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { toRpcError } from "@/lib/provider-error";
import { isCurrency } from "@/lib/currencies";
import type { Currency } from "@/lib/types/database";

/**
 * What CNY costs us, and what we charge for it — the two halves an operator
 * tunes.
 *
 * All three write through revoked SQL functions with the service role, and
 * all three log to the activity ledger inside that same function (0026). A
 * pricing change that nobody can attribute is a pricing change nobody can
 * explain later, and these are the numbers that decide every margin in the
 * CNY book.
 *
 * PERCENTAGES IN, FRACTIONS STORED. An operator thinks in "2%"; the database
 * stores 0.02. The conversion happens once, here, rather than in each form.
 */

export interface AdminRateState {
  error?: string;
  ok?: boolean;
  /** Echoed back so a rejected edit does not clear what was typed. */
  values?: Record<string, string>;
}

function revalidateRates() {
  revalidatePath("/admin/rates");
  revalidatePath("/convert");
  revalidatePath("/pay-to-china");
}

export async function setCnyTierRate(
  _prev: AdminRateState,
  formData: FormData,
): Promise<AdminRateState> {
  const actor = await requireAdminUser();

  const rawMin = String(formData.get("tierMin") ?? "").trim();
  const rawMax = String(formData.get("tierMax") ?? "").trim();
  const rawRate = String(formData.get("rate") ?? "").trim();
  const values = { tierMin: rawMin, tierMax: rawMax, rate: rawRate };

  const tierMin = Number(rawMin);
  const tierMax = Number(rawMax);
  const rate = Number(rawRate);

  if (!Number.isFinite(tierMin) || tierMin < 0) {
    return { error: "The band's lower bound must be zero or more.", values };
  }
  if (!Number.isFinite(tierMax) || tierMax <= tierMin) {
    return { error: "The band's upper bound must be above its lower bound.", values };
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    return { error: "Enter a CNY-per-USDT rate above zero.", values };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_cny_tier_rate", {
    p_tier_min: tierMin,
    p_tier_max: tierMax,
    p_rate: rate,
    p_admin_id: actor.id,
  });
  if (error) return { error: toRpcError(error, "admin"), values };

  revalidateRates();
  return { ok: true };
}

export async function deleteCnyTierRate(
  _prev: AdminRateState,
  formData: FormData,
): Promise<AdminRateState> {
  const actor = await requireAdminUser();
  const tierMin = Number(String(formData.get("tierMin") ?? ""));
  if (!Number.isFinite(tierMin)) return { error: "Pick a band to remove." };

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_delete_cny_tier_rate", {
    p_tier_min: tierMin,
    p_admin_id: actor.id,
  });
  // The function refuses to delete the last band — with no ladder, CNY
  // cannot be priced at all and every conversion and payment stops.
  if (error) return { error: toRpcError(error, "admin") };

  revalidateRates();
  return { ok: true };
}

export async function setCnyMarkupRate(
  _prev: AdminRateState,
  formData: FormData,
): Promise<AdminRateState> {
  const actor = await requireAdminUser();

  const rawFiat = String(formData.get("fiatPercent") ?? "").trim();
  const rawUsdt = String(formData.get("usdtPercent") ?? "").trim();
  const values = { fiatPercent: rawFiat, usdtPercent: rawUsdt };

  const fiatPercent = Number(rawFiat);
  const usdtPercent = Number(rawUsdt);

  if (!Number.isFinite(fiatPercent) || fiatPercent < 0 || fiatPercent >= 100) {
    return { error: "The fiat markup must be between 0 and 99.99 percent.", values };
  }
  if (!Number.isFinite(usdtPercent) || usdtPercent < 0 || usdtPercent >= 100) {
    return { error: "The USDT markup must be between 0 and 99.99 percent.", values };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_cny_markup_rate", {
    p_fiat_markup_rate: fiatPercent / 100,
    p_usdt_markup_rate: usdtPercent / 100,
    p_admin_id: actor.id,
  });
  if (error) return { error: toRpcError(error, "admin"), values };

  revalidateRates();
  return { ok: true };
}

/**
 * A supplier rate, as of a moment.
 *
 * APPEND-ONLY: this writes a new row rather than editing one. "What did an
 * order placed in March cost us" has to have an answer in March's terms, and
 * overwriting the rate would silently rewrite every historical margin in the
 * PNL report.
 */
export async function setSupplierRate(
  _prev: AdminRateState,
  formData: FormData,
): Promise<AdminRateState> {
  const actor = await requireAdminUser();

  const rawPair = String(formData.get("pair") ?? "");
  const [base, quote] = rawPair.split("/");
  const rawRate = String(formData.get("rate") ?? "").trim();
  const rawEffective = String(formData.get("effectiveFrom") ?? "").trim();
  const values = { pair: rawPair, rate: rawRate, effectiveFrom: rawEffective };

  if (!base || !quote || !isCurrency(base) || !isCurrency(quote)) {
    return { error: "Select a currency pair.", values };
  }
  if (base === quote) return { error: "A supplier rate needs two different currencies.", values };

  const rate = Number(rawRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { error: `Enter how many ${quote} one ${base} costs us.`, values };
  }

  // Blank means "from now", which is what an operator entering today's rate
  // means. A typed date is taken at face value so a rate can be backdated to
  // when it actually started applying.
  let effectiveFrom: string | null = null;
  if (rawEffective) {
    const parsed = new Date(rawEffective);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "That date isn't valid.", values };
    }
    effectiveFrom = parsed.toISOString();
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_supplier_rate", {
    p_base_currency: base as Currency,
    p_quote_currency: quote as Currency,
    p_buy_rate: rate,
    p_effective_from: effectiveFrom,
    p_admin_id: actor.id,
  });
  if (error) return { error: toRpcError(error, "admin"), values };

  revalidatePath("/admin/rates");
  revalidatePath("/admin/pnl");
  return { ok: true };
}

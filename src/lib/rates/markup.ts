import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";

/**
 * Server-only. The markup engine.
 *
 * A markup is stored per (base_currency, quote_currency) ORDERED pair, so
 * NGN->USDT and USDT->NGN are two independent rows — they carry genuinely
 * different spreads on the provider side and an operator needs to price them
 * separately. Editable from /admin/rates.
 *
 * Direction convention, used everywhere in this codebase without exception:
 * a rate is always QUOTE units per 1 BASE unit. Keeping one direction
 * throughout is what makes the markup maths and the PNL report auditable.
 *
 * The customer always gets the WORSE side of the provider rate: the provider
 * is asked to execute at its real, unmarked rate, and the customer is only
 * ever shown and credited the marked-up figure. The gap between what the
 * provider delivers and what we credit is the margin, and it is recorded on
 * every conversion row (provider_rate / markup_rate / customer_rate /
 * raw_target_amount) so /admin/pnl can report profit per order.
 */

/** Used when no row exists for a pair yet — 0.5%, the figure the operator confirmed. */
export const DEFAULT_MARKUP_RATE = 0.005;

export interface MarkupQuote {
  providerRate: number;
  markupRate: number;
  customerRate: number;
}

export async function getMarkupRate(base: Currency, quote: Currency): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("rate_markups")
      .select("markup_rate")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .maybeSingle();
    const parsed = Number(data?.markup_rate);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed < 1) return parsed;
  } catch (err) {
    console.error("[markup.getMarkupRate] falling back to default", { base, quote, err });
  }
  return DEFAULT_MARKUP_RATE;
}

/**
 * Applies the stored markup for this pair to a provider rate.
 *
 * The customer rate is always the one that yields the customer LESS of the
 * quote currency, whichever way the pair runs: `providerRate * (1 - markup)`.
 * Since the rate is quote-per-base and the customer receives quote, reducing
 * the rate reduces what they receive. That is the whole mechanism.
 */
export async function quoteWithMarkup(
  base: Currency,
  quote: Currency,
  providerRate: number,
): Promise<MarkupQuote> {
  const markupRate = await getMarkupRate(base, quote);
  return {
    providerRate,
    markupRate,
    customerRate: providerRate * (1 - markupRate),
  };
}

/** Applies a markup to a target amount directly, for provider-delivered figures. */
export function applyMarkupToAmount(rawTargetAmount: number, markupRate: number): number {
  return rawTargetAmount * (1 - markupRate);
}

/** All markups, for /admin/rates and the Home rate strip. */
export async function listMarkups() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("rate_markups")
    .select("*")
    .order("base_currency")
    .order("quote_currency");
  return data ?? [];
}

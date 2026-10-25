import type { Currency } from "@/lib/types/database";
import { probeFiatToUsdtRate } from "@/lib/busha/rate";
import { getAutomatedPayoutThresholdUsd } from "@/lib/settings";
import { getPayoutChannel } from "@/lib/busha/payout";
import { decideWithdrawalRouting } from "@/lib/withdrawals/rules";

/**
 * Server-only. Decides whether a withdrawal is paid out automatically or waits
 * for an admin.
 *
 * The threshold is read from app_settings, not a hardcoded 1000, so changing
 * the risk appetite of the whole payout system does not need a deploy.
 *
 * GROUP 4: the rolling per-user window is gone. A withdrawal is judged on its
 * own size, so several small withdrawals in one day are each automatic. The
 * other two reasons to hold one back — a currency with no payout route, and a
 * payout destination changed inside RECIPIENT_CHANGE_HOLD_HOURS — are
 * unchanged.
 *
 * This module is also what /withdraw calls to tell the user, BEFORE they
 * confirm, whether their withdrawal will be instant or will need approval.
 * The same function answers both questions, so the preview can never disagree
 * with what actually happens.
 */

/**
 * USD-equivalent of an amount. USD and USDT are treated as 1:1 — USDT is a USD
 * stablecoin and the threshold is a risk control, not an accounting figure, so
 * a fraction of a percent of peg drift is noise here.
 *
 * Every fiat conversion probes the provider with a tiny amount (see
 * probeFiatToUsdtRate's own notes on why a real amount can never be sent for a
 * rate lookup).
 */
export async function usdEquivalent(currency: Currency, amount: number): Promise<number> {
  if (currency === "USD" || currency === "USDT") return amount;
  const rate = await probeFiatToUsdtRate(currency);
  return amount * rate;
}

export type WithdrawalRouting = {
  /** True when this withdrawal will be paid out automatically. */
  automated: boolean;
  /** Why it will not be, in customer-facing language. Null when it will be. */
  reason: string | null;
  thresholdUsd: number;
  /** USD-equivalent of this request alone. */
  requestUsd: number;
};

/** Evaluates routing for a prospective or just-created withdrawal. */
export async function evaluateWithdrawalRouting(params: {
  currency: Currency;
  amount: number;
}): Promise<WithdrawalRouting> {
  const { currency, amount } = params;

  const [thresholdUsd, requestUsd] = await Promise.all([
    getAutomatedPayoutThresholdUsd(),
    usdEquivalent(currency, amount),
  ]);

  // The decision itself is a pure function in ../rules, so the rule can be read
  // and tested without a settings read and a live rate probe in front of it.
  return {
    thresholdUsd,
    requestUsd,
    ...decideWithdrawalRouting({
      hasPayoutChannel: Boolean(getPayoutChannel(currency)),
      currency,
      thresholdUsd,
      requestUsd,
    }),
  };
}

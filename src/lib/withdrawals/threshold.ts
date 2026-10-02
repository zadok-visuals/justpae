import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import { probeFiatToUsdtRate } from "@/lib/busha/rate";
import {
  getAutomatedPayoutThresholdUsd,
  getAutomatedPayoutWindowHours,
} from "@/lib/settings";
import { getPayoutChannel } from "@/lib/busha/payout";

/**
 * Server-only. Decides whether a withdrawal is paid out automatically or waits
 * for an admin.
 *
 * Two changes from the architecture this is built on, both deliberate:
 *
 *  1. The threshold is read from app_settings, not a hardcoded 1000. It was a
 *     literal buried in a module three files from any admin surface, so
 *     changing the risk appetite of the whole payout system needed a deploy.
 *
 *  2. A rolling per-user window is checked against the SAME threshold. Without
 *     it, every individual withdrawal can sit just under the limit and an
 *     unlimited amount moves per day with no review at all — the threshold
 *     only ever constrained one request in isolation. The window counts
 *     pending, processing and completed withdrawals (everything except
 *     failed), so a burst submitted back to back is caught rather than each
 *     request seeing an empty history.
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
  windowHours: number;
  /** USD-equivalent of this request alone. */
  requestUsd: number;
  /** USD-equivalent of the user's other withdrawals inside the window. */
  windowUsd: number;
};

/**
 * Evaluates routing for a prospective or just-created withdrawal.
 *
 * `excludeTransactionId` is passed once the withdrawal row already exists, so
 * the row being evaluated is not counted twice — once as `amount` and again as
 * part of the rolling total.
 */
export async function evaluateWithdrawalRouting(params: {
  userId: string;
  currency: Currency;
  amount: number;
  excludeTransactionId?: string;
}): Promise<WithdrawalRouting> {
  const { userId, currency, amount, excludeTransactionId } = params;

  const [thresholdUsd, windowHours] = await Promise.all([
    getAutomatedPayoutThresholdUsd(),
    getAutomatedPayoutWindowHours(),
  ]);

  const requestUsd = await usdEquivalent(currency, amount);
  const windowUsd = await rollingWithdrawalUsd(userId, windowHours, excludeTransactionId);

  const base = { thresholdUsd, windowHours, requestUsd, windowUsd };

  if (!getPayoutChannel(currency)) {
    return {
      ...base,
      automated: false,
      reason: `${currency} payouts are reviewed by our team before they go out.`,
    };
  }

  if (requestUsd > thresholdUsd) {
    return {
      ...base,
      automated: false,
      reason: "Withdrawals above our instant limit are reviewed by our team first.",
    };
  }

  if (requestUsd + windowUsd > thresholdUsd) {
    return {
      ...base,
      automated: false,
      reason: `This takes your withdrawals in the last ${windowHours} hours past our instant limit, so it will be reviewed first.`,
    };
  }

  return { ...base, automated: true, reason: null };
}

/**
 * Sum of a user's withdrawals inside the rolling window, in USD.
 *
 * The SQL side groups by currency and returns one row each, because summing
 * across currencies in SQL would produce a meaningless number. The conversion
 * to a common unit happens here, where the rate probe lives.
 *
 * A rate probe that fails must not silently under-count the window — that
 * would let a withdrawal through automation precisely when the provider is
 * unhealthy. An unconvertible currency's own units are added as a floor
 * instead, which can only ever push the total UP and therefore only ever
 * routes to manual review, never away from it.
 */
async function rollingWithdrawalUsd(
  userId: string,
  windowHours: number,
  excludeTransactionId?: string,
): Promise<number> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("rolling_withdrawal_total", {
    p_user_id: userId,
    p_hours: windowHours,
  });

  if (error) {
    console.error("[threshold.rollingWithdrawalUsd] rolling total lookup failed", error);
    // Fail closed: an unknown history is treated as "already at the limit", so
    // a database problem cannot open the automated path.
    return Number.POSITIVE_INFINITY;
  }

  const rows = data ?? [];
  let excludedUsd = 0;

  if (excludeTransactionId) {
    const { data: excluded } = await admin
      .from("transactions")
      .select("currency, amount, status")
      .eq("id", excludeTransactionId)
      .maybeSingle();
    if (excluded && excluded.status !== "failed") {
      excludedUsd = await safeUsdEquivalent(excluded.currency, Number(excluded.amount));
    }
  }

  let total = 0;
  for (const row of rows) {
    total += await safeUsdEquivalent(row.currency, Number(row.total));
  }

  return Math.max(total - excludedUsd, 0);
}

async function safeUsdEquivalent(currency: Currency, amount: number): Promise<number> {
  try {
    return await usdEquivalent(currency, amount);
  } catch (err) {
    console.error("[threshold.safeUsdEquivalent] rate probe failed, counting face value", {
      currency,
      err,
    });
    return amount;
  }
}

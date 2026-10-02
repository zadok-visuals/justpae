import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-only. Operator-tunable settings backed by the `app_settings` table,
 * editable from /admin/rates.
 *
 * These were hardcoded constants in the foundation this app is built on. The
 * automation threshold in particular was a literal `1000` buried in a module
 * three files away from the admin surface, which meant changing the risk
 * appetite of the whole payout system needed a deploy.
 */

export const SETTING_KEYS = {
  /**
   * Withdrawals at or below this USD-equivalent are paid out automatically;
   * anything above waits for admin approval. Default 1000.
   */
  automatedPayoutThresholdUsd: "automated_payout_threshold_usd",
  /**
   * The rolling window, in hours, over which a user's withdrawals are summed
   * and checked against the SAME threshold — so one large withdrawal can't be
   * split into several small automated ones. Default 24.
   */
  automatedPayoutWindowHours: "automated_payout_window_hours",
  /** Flat withdrawal fee as a fraction of the amount. Default 0.01 (1%). */
  withdrawalFeeRate: "withdrawal_fee_rate",
} as const;

export const SETTING_DEFAULTS: Record<string, number> = {
  [SETTING_KEYS.automatedPayoutThresholdUsd]: 1000,
  [SETTING_KEYS.automatedPayoutWindowHours]: 24,
  [SETTING_KEYS.withdrawalFeeRate]: 0.01,
};

/**
 * Reads one numeric setting, falling back to its documented default. A missing
 * row, an unparseable value or a database hiccup must never break a payout —
 * the default is always a safe value.
 */
export async function getNumericSetting(key: string): Promise<number> {
  const fallback = SETTING_DEFAULTS[key];
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
    const parsed = Number(data?.value);
    if (Number.isFinite(parsed)) return parsed;
  } catch (err) {
    console.error("[settings.getNumericSetting] falling back to default", { key, err });
  }
  return fallback;
}

export async function getAutomatedPayoutThresholdUsd(): Promise<number> {
  return getNumericSetting(SETTING_KEYS.automatedPayoutThresholdUsd);
}

export async function getAutomatedPayoutWindowHours(): Promise<number> {
  return getNumericSetting(SETTING_KEYS.automatedPayoutWindowHours);
}

export async function getWithdrawalFeeRate(): Promise<number> {
  return getNumericSetting(SETTING_KEYS.withdrawalFeeRate);
}

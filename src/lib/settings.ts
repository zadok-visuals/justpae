import { createAdminClient } from "@/lib/supabase/admin";
import {
  MANUAL_DEPOSIT_DEFAULTS,
  type ManualDepositConfig,
} from "@/lib/deposits/manualDeposit";
import type { SweepSettings } from "@/lib/treasury/sweep";

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
  /** Flat withdrawal fee as a fraction of the amount. Default 0.01 (1%). */
  withdrawalFeeRate: "withdrawal_fee_rate",
  /**
   * Bill payment fee as a fraction of the amount. Default 0 — the point of
   * this key is that the number has one server-side home, not that it starts
   * non-zero. Read inside create_bill_payment_for_user, in the same
   * transaction that debits; it was previously a p_fee argument the caller
   * supplied.
   */
  billPaymentFeeRate: "bill_payment_fee_rate",
  /** Consecutive wrong transaction PINs before the PIN locks. Default 5. */
  pinMaxFailedAttempts: "pin_max_failed_attempts",
  /** How long a locked transaction PIN stays locked, in minutes. Default 30. */
  pinLockMinutes: "pin_lock_minutes",

  /**
   * Migration 0037 — the company account naira bank-transfer deposits are
   * sent to, and the limits quoted before an amount is accepted. The three
   * account fields are TEXT, which is why they are not in SETTING_DEFAULTS
   * and not editable through setAppSetting (numbers only); see
   * setManualDepositAccount in actions/adminManualDeposits.ts.
   */
  manualDepositBankName: "manual_deposit_bank_name",
  manualDepositAccountNumber: "manual_deposit_account_number",
  manualDepositAccountName: "manual_deposit_account_name",
  manualDepositMinNgn: "manual_deposit_min_ngn",
  manualDepositMaxNgn: "manual_deposit_max_ngn",
  manualDepositFeeNgn: "manual_deposit_fee_ngn",

  /**
   * Which provider pays each currency out. TEXT, not numeric, so these are
   * absent from SETTING_DEFAULTS and set through setPayoutRoutes rather than
   * setAppSetting. Unset means Busha — see src/lib/withdrawals/route.ts for
   * why an unreadable value must never reroute a live payout.
   */
  payoutRouteNgn: "payout_route_ngn",
  payoutRouteKes: "payout_route_kes",

  /**
   * Migration 0042 — the daily treasury sweep. The three account fields and
   * sweep_paused_until are written together by admin_set_sweep_account, not
   * by setAppSetting: a destination half-changed is an account that exists
   * and is not the one anybody intended.
   */
  sweepFundingBankCode: "sweep_funding_bank_code",
  sweepFundingAccountNumber: "sweep_funding_account_number",
  sweepFundingAccountName: "sweep_funding_account_name",
  sweepMinKeepNgn: "sweep_min_keep_ngn",
  sweepTargetPayoutNgn: "sweep_target_payout_ngn",
  sweepMaxDailyNgn: "sweep_max_daily_ngn",
  sweepTimeLagos: "sweep_time_lagos",
  sweepPausedUntil: "sweep_paused_until",
} as const;

export const PAYOUT_ROUTE_SETTING_KEYS = {
  NGN: SETTING_KEYS.payoutRouteNgn,
  KES: SETTING_KEYS.payoutRouteKes,
} as const;

/** The six keys above, for the admin form and the customer-side reader. */
export const MANUAL_DEPOSIT_SETTING_KEYS = [
  SETTING_KEYS.manualDepositBankName,
  SETTING_KEYS.manualDepositAccountNumber,
  SETTING_KEYS.manualDepositAccountName,
  SETTING_KEYS.manualDepositMinNgn,
  SETTING_KEYS.manualDepositMaxNgn,
  SETTING_KEYS.manualDepositFeeNgn,
] as const;

export const SETTING_DEFAULTS: Record<string, number> = {
  [SETTING_KEYS.automatedPayoutThresholdUsd]: 1000,
  [SETTING_KEYS.withdrawalFeeRate]: 0.01,
  [SETTING_KEYS.billPaymentFeeRate]: 0,
  [SETTING_KEYS.pinMaxFailedAttempts]: 5,
  [SETTING_KEYS.pinLockMinutes]: 30,
  [SETTING_KEYS.manualDepositMinNgn]: MANUAL_DEPOSIT_DEFAULTS.minAmount,
  [SETTING_KEYS.manualDepositMaxNgn]: MANUAL_DEPOSIT_DEFAULTS.maxAmount,
  [SETTING_KEYS.manualDepositFeeNgn]: MANUAL_DEPOSIT_DEFAULTS.fee,
  [SETTING_KEYS.sweepMinKeepNgn]: 500_000,
  [SETTING_KEYS.sweepTargetPayoutNgn]: 2_000_000,
  [SETTING_KEYS.sweepMaxDailyNgn]: 1_000_000,
};

/** The three numeric sweep dials, for the admin form. */
export const SWEEP_NUMERIC_SETTING_KEYS = [
  SETTING_KEYS.sweepMinKeepNgn,
  SETTING_KEYS.sweepTargetPayoutNgn,
  SETTING_KEYS.sweepMaxDailyNgn,
] as const;

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

export async function getWithdrawalFeeRate(): Promise<number> {
  return getNumericSetting(SETTING_KEYS.withdrawalFeeRate);
}

/**
 * The stored payout route for one currency, as a raw string — resolving it to
 * a provider is resolvePayoutRoute's job, which also applies the flag and the
 * currency check. Returns null on any read failure, which that function reads
 * as Busha.
 */
export async function getPayoutRouteSetting(currency: "NGN" | "KES"): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", PAYOUT_ROUTE_SETTING_KEYS[currency])
      .maybeSingle();
    return data?.value ?? null;
  } catch (err) {
    console.error("[settings.getPayoutRouteSetting] falling back to Busha", { currency, err });
    return null;
  }
}

/** Both routes in one round trip, for the admin screen. */
export async function getPayoutRouteSettings(): Promise<Record<"NGN" | "KES", string | null>> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", [SETTING_KEYS.payoutRouteNgn, SETTING_KEYS.payoutRouteKes]);
    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
    return {
      NGN: byKey.get(SETTING_KEYS.payoutRouteNgn) ?? null,
      KES: byKey.get(SETTING_KEYS.payoutRouteKes) ?? null,
    };
  } catch (err) {
    console.error("[settings.getPayoutRouteSettings] falling back to Busha", err);
    return { NGN: null, KES: null };
  }
}

/**
 * The manual NGN deposit configuration, in one round trip.
 *
 * READ SERVER-SIDE AND PASSED DOWN, never fetched by the browser. app_settings
 * is readable by any authenticated session (0002) and nothing secret lives in
 * these six — but reading them here is what stops the screen being made to
 * show an account number the server did not choose.
 *
 * Falls back to the documented defaults on any read failure, and leaves the
 * three text fields EMPTY rather than inventing an account. The customer
 * screen refuses to render instructions until all three are set — see
 * isManualDepositConfigured.
 */
export async function getManualDepositConfig(): Promise<ManualDepositConfig> {
  const fallback: ManualDepositConfig = {
    bankName: "",
    accountNumber: "",
    accountName: "",
    ...MANUAL_DEPOSIT_DEFAULTS,
  };

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", [...MANUAL_DEPOSIT_SETTING_KEYS]);

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value ?? ""]));
    const text = (key: string) => (byKey.get(key) ?? "").trim();
    const num = (key: string, dflt: number) => {
      const parsed = Number(text(key));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : dflt;
    };

    return {
      bankName: text(SETTING_KEYS.manualDepositBankName),
      accountNumber: text(SETTING_KEYS.manualDepositAccountNumber),
      accountName: text(SETTING_KEYS.manualDepositAccountName),
      minAmount: num(SETTING_KEYS.manualDepositMinNgn, MANUAL_DEPOSIT_DEFAULTS.minAmount),
      maxAmount: num(SETTING_KEYS.manualDepositMaxNgn, MANUAL_DEPOSIT_DEFAULTS.maxAmount),
      fee: num(SETTING_KEYS.manualDepositFeeNgn, MANUAL_DEPOSIT_DEFAULTS.fee),
    };
  } catch (err) {
    console.error("[settings.getManualDepositConfig] falling back to defaults", err);
    return fallback;
  }
}

/**
 * The eight sweep settings, in one round trip.
 *
 * The three account fields fall back to EMPTY, never to a guess, and
 * sweepDestinationReady refuses to run the sweep until all three are set —
 * the same shape as the manual deposit account above, and for a stronger
 * reason: this one is a destination the company's own money is sent to.
 */
export async function getSweepSettings(): Promise<SweepSettings> {
  const fallback: SweepSettings = {
    minKeep: SETTING_DEFAULTS[SETTING_KEYS.sweepMinKeepNgn]!,
    target: SETTING_DEFAULTS[SETTING_KEYS.sweepTargetPayoutNgn]!,
    maxDaily: SETTING_DEFAULTS[SETTING_KEYS.sweepMaxDailyNgn]!,
    timeLagos: "17:30",
    bankCode: "",
    accountNumber: "",
    accountName: "",
    pausedUntil: null,
  };

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", [
        SETTING_KEYS.sweepFundingBankCode,
        SETTING_KEYS.sweepFundingAccountNumber,
        SETTING_KEYS.sweepFundingAccountName,
        SETTING_KEYS.sweepMinKeepNgn,
        SETTING_KEYS.sweepTargetPayoutNgn,
        SETTING_KEYS.sweepMaxDailyNgn,
        SETTING_KEYS.sweepTimeLagos,
        SETTING_KEYS.sweepPausedUntil,
      ]);

    const byKey = new Map((data ?? []).map((row) => [row.key, (row.value ?? "").trim()]));
    const text = (key: string) => byKey.get(key) ?? "";
    const num = (key: string) => {
      const parsed = Number(text(key));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : SETTING_DEFAULTS[key]!;
    };

    return {
      minKeep: num(SETTING_KEYS.sweepMinKeepNgn),
      target: num(SETTING_KEYS.sweepTargetPayoutNgn),
      maxDaily: num(SETTING_KEYS.sweepMaxDailyNgn),
      timeLagos: text(SETTING_KEYS.sweepTimeLagos) || "17:30",
      bankCode: text(SETTING_KEYS.sweepFundingBankCode),
      accountNumber: text(SETTING_KEYS.sweepFundingAccountNumber),
      accountName: text(SETTING_KEYS.sweepFundingAccountName),
      pausedUntil: text(SETTING_KEYS.sweepPausedUntil) || null,
    };
  } catch (err) {
    // Falls back to a destination-less config, which cannot sweep. The safe
    // direction for an unreadable setting that moves money.
    console.error("[settings.getSweepSettings] falling back to a sweep that cannot run", err);
    return fallback;
  }
}

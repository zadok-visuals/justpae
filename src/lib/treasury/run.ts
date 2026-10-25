import {
  manualSweepReference,
  shouldSweepNow,
  sweepAmount,
  sweepDestinationReady,
  sweepPaused,
  sweepReference,
  type SweepSettings,
  type SweepSkip,
} from "./sweep.ts";

/**
 * Running one sweep.
 *
 * Dependency-injected and import-free, for the reason every money module
 * here is: the order below — record the movement, THEN send it — is what
 * makes a sweep unrepeatable, and it has to be testable without a provider.
 *
 * THE ORDER IS THE RULE. record() inserts under the unique index on
 * treasury_movements.reference and returns null when the reference already
 * exists. Only a non-null answer is permission to call the payout API, so
 * two cron runs a second apart send one transfer — the same shape as
 * claim_payout_attempt for customer payouts.
 */

export interface SweepDeps {
  depositBalance(): Promise<number | null>;
  payoutBalance(): Promise<number | null>;
  /** Everything already moved today, so the daily maximum is a real cap. */
  sweptToday(lagosDate: string): Promise<{ total: number; count: number }>;
  /** Null when the reference is already recorded. */
  record(input: {
    reference: string;
    amount: number;
    source: "automatic" | "manual";
    lagosDate: string;
    adminId?: string;
  }): Promise<{ id: string } | null>;
  send(input: { reference: string; amount: number }): Promise<{ status: string }>;
  settle(reference: string, status: "sent" | "failed", providerReference?: string): Promise<void>;
  emailAdmins(input: {
    amount: number;
    automatic: boolean;
    depositBalance: number;
    payoutBalance: number;
  }): Promise<void>;
  log?(level: "warn" | "error", message: string, detail: Record<string, unknown>): void;
}

export type SweepResult =
  | { swept: false; reason: SweepSkip | "already_swept" | "send_failed" }
  | { swept: true; amount: number; reference: string };

export async function runSweep(
  deps: SweepDeps,
  options: {
    settings: SweepSettings;
    flagEnabled: boolean;
    /** A "Sweep now" press. Skips the time-of-day check and nothing else. */
    manual?: boolean;
    adminId?: string;
    now?: Date;
    currency?: string;
  },
): Promise<SweepResult> {
  const log = deps.log ?? (() => {});
  const currency = options.currency ?? "NGN";
  const now = options.now ?? new Date();

  let lagosDate: string;
  if (options.manual) {
    // The same rules, minus the clock. An admin pressing the button has
    // decided it is time; they have not decided the destination is safe, the
    // pause is over, or the daily maximum does not apply.
    if (!options.flagEnabled) return { swept: false, reason: "flag_off" };
    if (sweepPaused(options.settings.pausedUntil, now.getTime())) {
      return { swept: false, reason: "paused" };
    }
    if (!sweepDestinationReady(options.settings)) {
      return { swept: false, reason: "no_destination" };
    }
    lagosDate = new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
  } else {
    const due = shouldSweepNow({
      flagEnabled: options.flagEnabled,
      settings: options.settings,
      now,
    });
    if (!due.run) return { swept: false, reason: due.reason };
    lagosDate = due.lagosDate;
  }

  const [depositBalance, payoutBalance, today] = await Promise.all([
    deps.depositBalance(),
    deps.payoutBalance(),
    deps.sweptToday(lagosDate),
  ]);

  if (depositBalance == null || payoutBalance == null) {
    // A balance we could not read is not a balance we may sweep against.
    // Unlike the payout gate, where unknown means "let the provider decide",
    // here nobody is waiting and guessing costs more than waiting a day.
    log("error", "could not read both balances, not sweeping", {
      depositBalance,
      payoutBalance,
    });
    return { swept: false, reason: "nothing_to_move" };
  }

  const amount = sweepAmount({
    depositBalance,
    payoutBalance,
    minKeep: options.settings.minKeep,
    target: options.settings.target,
    maxDaily: options.settings.maxDaily,
    alreadySweptToday: today.total,
  });

  if (amount <= 0) return { swept: false, reason: "nothing_to_move" };

  const reference = options.manual
    ? manualSweepReference(currency, lagosDate, today.count + 1)
    : sweepReference(currency, lagosDate);

  // THE CLAIM. Before the money moves, not after.
  const recorded = await deps.record({
    reference,
    amount,
    source: options.manual ? "manual" : "automatic",
    lagosDate,
    adminId: options.adminId,
  });
  if (!recorded) {
    log("warn", "this sweep is already recorded, not sending it again", { reference });
    return { swept: false, reason: "already_swept" };
  }

  try {
    const sent = await deps.send({ reference, amount });
    await deps.settle(reference, "sent", sent.status);
  } catch (err) {
    // The movement row stays, marked failed, holding the reference. A failed
    // sweep is not retried inside the same day by design: the next run reads
    // a reference that already exists and stops, which is the safe side of
    // "we are not sure whether that transfer left".
    log("error", "the sweep transfer was refused", {
      reference,
      error: err instanceof Error ? err.message : String(err),
    });
    await deps.settle(reference, "failed");
    return { swept: false, reason: "send_failed" };
  }

  await deps.emailAdmins({
    amount,
    automatic: !options.manual,
    depositBalance: depositBalance - amount,
    payoutBalance,
  });

  return { swept: true, amount, reference };
}

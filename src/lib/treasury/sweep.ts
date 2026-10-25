/**
 * The daily sweep: moving naira from the balance deposits land in to the one
 * payouts leave from.
 *
 * Import-free and pure, like every other money rule in this codebase that is
 * worth testing. The arithmetic here decides how much of the company's own
 * money moves without anybody pressing anything, which is exactly the kind of
 * thing that should be readable in one screen and exercised by name.
 */

export interface SweepSettings {
  /** Naira to leave behind for payouts. The sweep never goes below this. */
  minKeep: number;
  /** What the payout balance should hold. The sweep tops up to here. */
  target: number;
  /** The most that may move in one day, automatic and manual together. */
  maxDaily: number;
  /** Local Lagos time, "HH:MM". */
  timeLagos: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  /** ISO timestamp, or null. Set for 24 hours when the destination changes. */
  pausedUntil: string | null;
}

/**
 * How much to move, to the naira.
 *
 * THE SMALLER OF THREE, and each one is a different kind of limit:
 *   - what is spare       (deposit balance above the minimum to keep)
 *   - what is needed      (how far the payout balance is below its target)
 *   - what is permitted   (the daily maximum, minus whatever already moved)
 *
 * Zero when any of them is zero or negative. Rounded DOWN, because rounding
 * a sweep up is a transfer the settings did not authorise.
 */
export function sweepAmount(input: {
  depositBalance: number;
  payoutBalance: number;
  minKeep: number;
  target: number;
  maxDaily: number;
  alreadySweptToday: number;
}): number {
  const spare = input.depositBalance - input.minKeep;
  const needed = input.target - input.payoutBalance;
  const permitted = input.maxDaily - input.alreadySweptToday;

  const amount = Math.min(spare, needed, permitted);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.floor(amount * 100) / 100;
}

/** Whether a destination change has the sweep paused right now. */
export function sweepPaused(pausedUntil: string | null | undefined, now: number = Date.now()): boolean {
  if (!pausedUntil) return false;
  const until = new Date(pausedUntil).getTime();
  if (!Number.isFinite(until)) return false;
  return now < until;
}

/** All three account fields, or the sweep does not run. */
export function sweepDestinationReady(settings: SweepSettings): boolean {
  return Boolean(
    settings.bankCode.trim() && settings.accountNumber.trim() && settings.accountName.trim(),
  );
}

/**
 * Lagos is UTC+1 all year — Nigeria has never observed daylight saving — so
 * the local date and time are a fixed offset rather than a zone lookup.
 * Returned as { date: "YYYY-MM-DD", minutes: minutes past midnight }.
 */
export function lagosClock(now: Date = new Date()): { date: string; minutes: number } {
  const lagos = new Date(now.getTime() + 60 * 60 * 1000);
  const date = lagos.toISOString().slice(0, 10);
  return { date, minutes: lagos.getUTCHours() * 60 + lagos.getUTCMinutes() };
}

/** "17:30" as minutes past midnight, or null when it is not a time. */
export function parseSweepTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** The reference a day's automatic sweep is recorded under. One per day. */
export function sweepReference(currency: string, lagosDate: string): string {
  return `sweep_${currency}_${lagosDate}`;
}

/** A manual sweep's reference. Unique per run, so each one stands alone. */
export function manualSweepReference(currency: string, lagosDate: string, sequence: number): string {
  return `sweep_${currency}_${lagosDate}_m${sequence}`;
}

export type SweepSkip =
  | "flag_off"
  | "paused"
  | "no_destination"
  | "not_yet_today"
  | "nothing_to_move";

/**
 * Whether the automatic sweep should run right now, and why not when it
 * should not. Pure, so "it did not run last night" is answerable without a
 * provider or a database.
 */
export function shouldSweepNow(input: {
  flagEnabled: boolean;
  settings: SweepSettings;
  now?: Date;
}): { run: true; lagosDate: string } | { run: false; reason: SweepSkip } {
  if (!input.flagEnabled) return { run: false, reason: "flag_off" };

  const now = input.now ?? new Date();
  if (sweepPaused(input.settings.pausedUntil, now.getTime())) {
    return { run: false, reason: "paused" };
  }
  if (!sweepDestinationReady(input.settings)) return { run: false, reason: "no_destination" };

  const clock = lagosClock(now);
  const due = parseSweepTime(input.settings.timeLagos);
  // An unreadable time is treated as the default rather than as "run now":
  // a typo in a settings field must not move money an hour early.
  if (clock.minutes < (due ?? 17 * 60 + 30)) return { run: false, reason: "not_yet_today" };

  return { run: true, lagosDate: clock.date };
}

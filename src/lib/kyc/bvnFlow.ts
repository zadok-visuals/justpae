/**
 * Pure decision logic for the BVN flow — Dojah's match verdict, the confirm
 * step, the change-BVN preconditions, and the attempt limit. Kept separate
 * from src/lib/actions/kyc.ts (which does the actual Supabase/Dojah/Korapay
 * calls) for the same reason src/lib/routes/access.ts and
 * src/lib/korapay/accountGate.ts are pure: these are the rules a test can
 * hold still, without a database or a provider behind them.
 */

import { isValidBvn } from "./bvn.ts";
import type { DojahBvnResponse } from "../dojah/client.ts";

/** First and last word of a full name — good enough for Dojah's first/last
 *  name match check, which is itself tolerant of near misses via confidence
 *  scoring rather than an exact string compare. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}

export interface DojahMatchInput {
  lastNameMatches: boolean;
  firstNameConfidence: number | null;
}

/** Reads the two fields the save rule cares about off Dojah's response,
 *  leaving everything else — including any name or date of birth it carries
 *  — untouched and unread. */
export function dojahMatchInput(response: DojahBvnResponse): DojahMatchInput {
  return {
    lastNameMatches: response.entity?.last_name?.status === true,
    firstNameConfidence: response.entity?.first_name?.confidence_value ?? null,
  };
}

/** The save rule: the last name must match, and the first name match must be
 *  at least 80% confident. Either failing is a mismatch, never a partial
 *  success. */
export function evaluateDojahMatch(input: DojahMatchInput): "matched" | "mismatch" {
  if (!input.lastNameMatches) return "mismatch";
  if (input.firstNameConfidence == null || input.firstNameConfidence < 80) return "mismatch";
  return "matched";
}

export function bvnConfirmationMatches(bvn: string, confirmBvn: string): boolean {
  return bvn.trim() === confirmBvn.trim();
}

/** 5 attempts per 24 hours. The counting itself happens in Postgres
 *  (record_bvn_attempt, migration 0045); this is the threshold decision,
 *  kept here so it can be tested without a database. */
export function exceedsBvnAttemptLimit(attemptsInWindow: number, limit = 5): boolean {
  return attemptsInWindow > limit;
}

/** Once a virtual account has been issued against a BVN, it is locked —
 *  changing it would mean an account number issued against a number that no
 *  longer matches what is on file. */
export function canChangeBvn(hasIssuedAccount: boolean): boolean {
  return !hasIssuedAccount;
}

export const BVN_TOO_MANY_ATTEMPTS = "Too many attempts. Try again tomorrow or contact support.";
export const BVN_LOCKED_MESSAGE = "Contact support to change your BVN.";
export const BVN_CONFIRM_MISMATCH = "Those two don't match. Re-enter your BVN.";
export const BVN_FORMAT_ERROR = "A BVN is exactly 11 digits. Dial *565*0# to get it.";
export const BVN_DOJAH_MISMATCH_MESSAGE =
  "That BVN doesn't match the name on your account. Check it and try again.";

export type BvnPrecheck = { ok: true } | { ok: false; error: string };

/** Everything a first-time BVN save must satisfy before a provider is ever
 *  called: the format, the confirm field, and the attempt limit. */
export function precheckSaveBvn(input: {
  bvn: string;
  confirmBvn: string;
  attemptsInWindow: number;
}): BvnPrecheck {
  if (exceedsBvnAttemptLimit(input.attemptsInWindow)) {
    return { ok: false, error: BVN_TOO_MANY_ATTEMPTS };
  }
  if (!input.bvn.trim()) return { ok: false, error: "Enter your BVN to continue." };
  if (!isValidBvn(input.bvn)) return { ok: false, error: BVN_FORMAT_ERROR };
  if (!bvnConfirmationMatches(input.bvn, input.confirmBvn)) {
    return { ok: false, error: BVN_CONFIRM_MISMATCH };
  }
  return { ok: true };
}

/** Everything a CHANGE to an already-saved BVN must satisfy — the save
 *  checks above, plus the lock (no account issued yet) and the PIN. The lock
 *  is checked first: a locked account should never be told "enter your PIN"
 *  for a change it cannot make regardless of what is typed. `attemptsInWindow`
 *  is a count the caller already read, not something this function
 *  increments — the actual recording happens only once this returns ok. */
export function precheckChangeBvn(input: {
  pin: string;
  bvn: string;
  confirmBvn: string;
  hasIssuedAccount: boolean;
  attemptsInWindow: number;
}): BvnPrecheck {
  if (!canChangeBvn(input.hasIssuedAccount)) return { ok: false, error: BVN_LOCKED_MESSAGE };
  if (!input.pin.trim()) {
    return { ok: false, error: "Enter your transaction PIN to confirm this change." };
  }
  return precheckSaveBvn({
    bvn: input.bvn,
    confirmBvn: input.confirmBvn,
    attemptsInWindow: input.attemptsInWindow,
  });
}

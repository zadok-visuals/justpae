/**
 * Settling one virtual-account pay-in.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY IT IS DEPENDENCY-INJECTED RATHER THAN IMPORTING WHAT IT NEEDS
 *
 * The rules in here are the ones that decide whether a wallet moves:
 *
 *   1. the PAYLOAD'S amount is never used — only a freshly queried charge's;
 *   2. a charge in any state but success does nothing;
 *   3. a charge in any currency but NGN does nothing;
 *   4. a charge against an account number we did not issue is IGNORED, not
 *      guessed at;
 *   5. the same reference twice credits once.
 *
 * Every one of those is a rule about control flow, not about SQL or HTTP, and
 * each has a failure mode that is silent in production and obvious in a test.
 * So the module imports nothing: the route hands it the real provider client
 * and the real service-role client, and settle.test.ts hands it fakes. It
 * also keeps this file reachable from `node --test`, which has no bundler and
 * cannot resolve the "@/" alias.
 *
 * Rule 5 is ALSO enforced in the database — credit_korapay_deposit inserts
 * under a unique index — and that is the enforcement. What is tested here is
 * that this layer does not defeat it by, say, notifying twice.
 */

export interface SettleCharge {
  reference: string;
  status: string;
  currency: string;
  amount: string | number;
  fee?: string | number;
  accountNumber: string | null;
}

export interface SettleAccount {
  id: string;
  userId: string;
}

export type CreditResult = "credited" | "already_credited" | "below_fee";

export interface SettleDeps {
  /** A FRESH read from the provider. Never the webhook body. */
  getCharge(reference: string): Promise<SettleCharge>;
  findAccountByNumber(accountNumber: string): Promise<SettleAccount | null>;
  credit(input: {
    userId: string;
    virtualAccountId: string;
    reference: string;
    grossAmount: number;
    providerFee: number;
  }): Promise<{ result: CreditResult } | { error: string }>;
  /** Only ever called after a credit that actually happened. */
  notify(reference: string): Promise<void>;
  log?(level: "warn" | "error", message: string, detail: Record<string, unknown>): void;
}

export type SettleOutcome =
  | "credited"
  | "already_credited"
  | "below_fee"
  | "not_success"
  | "wrong_currency"
  | "no_account_number"
  | "unknown_account"
  | "unusable_amount"
  | "lookup_failed"
  | "credit_failed";

export async function settleKorapayCharge(
  deps: SettleDeps,
  reference: string,
): Promise<SettleOutcome> {
  const log = deps.log ?? (() => {});

  // ── 1. Ask the provider. The payload is a trigger, not evidence ────────
  let charge: SettleCharge;
  try {
    charge = await deps.getCharge(reference);
  } catch (err) {
    // Nothing happens without confirmation. The reconcile cron tries again,
    // which is why this is not an error the caller propagates.
    log("error", "could not re-fetch the charge", {
      reference,
      error: err instanceof Error ? err.message : String(err),
    });
    return "lookup_failed";
  }

  if (charge.status !== "success") {
    log("warn", "payload claimed success, the provider disagrees", {
      reference,
      actualStatus: charge.status,
    });
    return "not_success";
  }

  if ((charge.currency ?? "").trim().toUpperCase() !== "NGN") {
    // Crediting a non-naira arrival into a naira wallet is never a
    // self-correction; it is a mismatch, and acting on it is worse than
    // doing nothing.
    log("error", "charge is not NGN, taking no action", {
      reference,
      currency: charge.currency,
    });
    return "wrong_currency";
  }

  // ── 2. The account has to be one of ours, and has to belong to someone ─
  if (!charge.accountNumber) {
    log("error", "charge carries no virtual account number", { reference });
    return "no_account_number";
  }

  const account = await deps.findAccountByNumber(charge.accountNumber);
  if (!account) {
    // IGNORED, not errored. A charge against an account number we did not
    // issue is either another product on the same merchant or a forgery that
    // got past nothing. Either way there is no user to credit, and inventing
    // one is the only genuinely dangerous thing this function could do.
    log("error", "no virtual account matches, ignoring", { reference });
    return "unknown_account";
  }

  // ── 3. The credit, from the QUERIED figures ────────────────────────────
  const gross = Number(charge.amount);
  if (!Number.isFinite(gross) || gross <= 0) {
    log("error", "the charge has no usable amount", { reference });
    return "unusable_amount";
  }
  const providerFee = Number(charge.fee);

  const credited = await deps.credit({
    userId: account.userId,
    virtualAccountId: account.id,
    reference,
    grossAmount: gross,
    providerFee: Number.isFinite(providerFee) ? providerFee : 0,
  });

  if ("error" in credited) {
    log("error", "credit failed", { reference, error: credited.error });
    return "credit_failed";
  }

  if (credited.result !== "credited") {
    // 'already_credited' is the normal outcome when the cron got there
    // first, and is not worth an error line. 'below_fee' is an operations
    // problem — a deposit fee set above what people actually send.
    if (credited.result === "below_fee") {
      log("error", "arrival does not cover the deposit fee", { reference });
    }
    return credited.result;
  }

  // ── 4. Tell them. Only after a credit that actually happened ───────────
  await deps.notify(reference);
  return "credited";
}

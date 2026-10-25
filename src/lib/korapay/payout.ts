/**
 * Paying one withdrawal out through Korapay.
 *
 * Dependency-injected and import-free, for the reasons settle.ts gives: every
 * rule below is about control flow around money, each fails silently in
 * production, and `node --test` has no bundler and cannot resolve "@/".
 *
 * THE FIVE RULES:
 *
 *   1. The provider's balance is read BEFORE it is called. Too low means the
 *      withdrawal is held for review and the provider is never asked.
 *   2. A bank destination has its name resolved and checked against the
 *      verified name first. A mistyped account number is the one mistake in
 *      this product with no recall.
 *   3. The row is CLAIMED before the payout call. Only the caller that wins
 *      the claim calls the provider, so the retry cron, the webhook and a
 *      synchronous attempt cannot pay the same withdrawal twice.
 *   4. An unanswered call (timeout, 5xx) is never read as a failure. The
 *      payout is QUERIED, and the money stays held until something terminal
 *      comes back.
 *   5. The wallet is only refunded when the provider says, on a fresh query,
 *      that the payout failed.
 */

export type PayoutCurrency = "NGN" | "KES";

export interface PayoutRecipient {
  account_holder_name: string;
  bank_account_number: string | null;
  bank_name: string | null;
  bank_code: string | null;
}

export type KorapayDestination =
  | { type: "bank"; bankCode: string; accountNumber: string }
  | { type: "mobile_money"; operatorSlug: string; phoneNumber: string };

export interface MobileMoneyOperator {
  slug: string;
  name: string;
}

/** Korapay's KES default when the saved recipient names no operator. */
const DEFAULT_KE_OPERATOR = "safaricom-ke";

/**
 * Name tokens, for comparing a bank's rendering of a name with ours.
 *
 * Banks return "ADEYEMI JOHN OLU" where the profile says "John Olu Adeyemi".
 * An exact match would refuse almost every genuine payout, so the comparison
 * is on the SET of tokens, with single letters dropped — an initial on one
 * side and a full middle name on the other is the same person.
 */
export function nameTokens(value: string): string[] {
  return value
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

/**
 * Whether the bank's name for an account is the customer's verified name.
 *
 * Every token of the SHORTER name must appear in the longer one. That accepts
 * a reordering and a dropped middle name, and refuses a different person —
 * which is the only distinction this check has to make.
 */
export function resolvedNameMatches(verifiedName: string, resolvedName: string): boolean {
  const verified = nameTokens(verifiedName);
  const resolved = nameTokens(resolvedName);
  if (verified.length === 0 || resolved.length === 0) return false;

  const [shorter, longer] = verified.length <= resolved.length ? [verified, resolved] : [resolved, verified];
  return shorter.every((token) => longer.includes(token));
}

/**
 * Where a payout for this currency goes.
 *
 * NGN is always a bank account. KES is a bank when the saved recipient has a
 * bank code and an M-Pesa number otherwise — which is how every KES recipient
 * is stored today, because the Busha rail that wrote them is mobile-money
 * only.
 *
 * The operator slug is matched against the LIVE list rather than hardcoded: a
 * wrong slug is a payout that is accepted and then silently never arrives.
 */
export function korapayDestinationFor(
  currency: string,
  recipient: PayoutRecipient,
  operators: MobileMoneyOperator[],
): { destination: KorapayDestination } | { error: string } {
  const account = (recipient.bank_account_number ?? "").trim();

  if (currency === "NGN") {
    const bankCode = (recipient.bank_code ?? "").trim();
    if (!bankCode || !account) return { error: "Missing bank details for an automated naira payout" };
    return { destination: { type: "bank", bankCode, accountNumber: account } };
  }

  if (currency === "KES") {
    if (!account) return { error: "Missing destination for an automated shilling payout" };

    const bankCode = (recipient.bank_code ?? "").trim();
    if (bankCode) return { destination: { type: "bank", bankCode, accountNumber: account } };

    const wanted = (recipient.bank_name ?? "").trim().toUpperCase();
    const matched =
      operators.find((op) => op.name.toUpperCase() === wanted || op.slug.toUpperCase() === wanted) ??
      operators.find((op) => op.slug === DEFAULT_KE_OPERATOR);
    if (!matched) return { error: "No mobile money operator is available for this payout" };

    return {
      destination: { type: "mobile_money", operatorSlug: matched.slug, phoneNumber: account },
    };
  }

  // GHS stays locked and USDT has no Korapay rail at all. Reaching here is a
  // routing mistake, not a provider one, so it says so rather than guessing.
  return { error: `${currency} payouts do not route through this provider` };
}

/** The reason text the brief specifies, verbatim, in one place. */
export function payoutBalanceHoldReason(currency: string): string {
  return `Not enough ${currency} in the payout balance`;
}

/**
 * Whether a provider balance is too low to attempt this payout.
 *
 * A NULL balance means the read itself failed, and that is NOT treated as
 * "too low": an outage on the balance endpoint would otherwise freeze every
 * payout in the system, when the payout call itself would have been refused
 * cleanly anyway. Unknown proceeds; known-and-short does not.
 */
export function payoutBalanceTooLow(available: number | null, amount: number): boolean {
  if (available == null || !Number.isFinite(available)) return false;
  return available < amount;
}

export function isPayoutSuccess(status: string | undefined): boolean {
  return status === "success" || status === "successful";
}

export function isPayoutFailure(status: string | undefined): boolean {
  return status === "failed" || status === "expired" || status === "reversed" || status === "cancelled";
}

// ── Running one payout ──────────────────────────────────────────────────────

export interface PayoutQueryResult {
  status: string;
  /** False when the provider has no transaction under this reference. */
  found: boolean;
}

export interface KorapayPayoutDeps {
  availableBalance(currency: string): Promise<number | null>;
  mobileMoneyOperators(): Promise<MobileMoneyOperator[]>;
  resolveAccountName(input: { bankCode: string; accountNumber: string }): Promise<string>;
  /** True for the one caller allowed to call the provider. */
  claim(reference: string): Promise<boolean>;
  disburse(input: {
    reference: string;
    amount: number;
    currency: string;
    destination: KorapayDestination;
    customerName: string;
    customerEmail?: string;
  }): Promise<{ status: string }>;
  query(reference: string): Promise<PayoutQueryResult>;
  /** Returns true the first time, which is when admins are emailed. */
  holdForBalance(reason: string): Promise<boolean>;
  emailAdminsAboutBalance(reason: string): Promise<void>;
  /** Records a failure that happened before any provider call. */
  recordFailure(reason: string): Promise<void>;
  releaseClaim(reference: string, reason: string): Promise<void>;
  complete(): Promise<void>;
  /** Refunds the wallet. Only ever after a fresh query says so. */
  fail(reason: string): Promise<void>;
  notifyCompleted(): Promise<void>;
  notifyFailed(reason: string): Promise<void>;
  log?(level: "warn" | "error", message: string, detail: Record<string, unknown>): void;
}

export type KorapayPayoutOutcome =
  | "paid"
  | "pending"
  | "balance_held"
  | "name_mismatch"
  | "no_destination"
  | "not_claimed"
  | "released"
  | "failed";

export async function runKorapayPayout(
  deps: KorapayPayoutDeps,
  input: {
    reference: string;
    currency: string;
    amount: number;
    recipient: PayoutRecipient;
    customerName: string;
    customerEmail?: string;
  },
): Promise<KorapayPayoutOutcome> {
  const log = deps.log ?? (() => {});
  const { reference, currency, amount } = input;

  // ── 1. Where is it going? Before anything expensive ─────────────────────
  const operators =
    currency === "KES" && !(input.recipient.bank_code ?? "").trim()
      ? await deps.mobileMoneyOperators().catch(() => [])
      : [];

  const routed = korapayDestinationFor(currency, input.recipient, operators);
  if ("error" in routed) {
    log("error", "no usable payout destination", { reference, currency });
    await deps.recordFailure(routed.error);
    return "no_destination";
  }

  // ── 2. Is there money to send? ──────────────────────────────────────────
  let available: number | null = null;
  try {
    available = await deps.availableBalance(currency);
  } catch (err) {
    // Unknown, not empty. See payoutBalanceTooLow.
    log("error", "could not read the payout balance", {
      currency,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (payoutBalanceTooLow(available, amount)) {
    const reason = payoutBalanceHoldReason(currency);
    const first = await deps.holdForBalance(reason);
    if (first) await deps.emailAdminsAboutBalance(reason);
    log("error", "payout balance is short, not calling the provider", {
      reference,
      currency,
      available,
      amount,
    });
    return "balance_held";
  }

  // ── 3. Does the account belong to them? ─────────────────────────────────
  if (routed.destination.type === "bank") {
    let resolvedName: string;
    try {
      resolvedName = await deps.resolveAccountName({
        bankCode: routed.destination.bankCode,
        accountNumber: routed.destination.accountNumber,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("error", "could not resolve the payout account", { reference, message });
      await deps.recordFailure(`Could not confirm the payout account name: ${message}`.slice(0, 1000));
      return "name_mismatch";
    }

    if (!resolvedNameMatches(input.recipient.account_holder_name, resolvedName)) {
      // The resolved name is recorded because an operator has to be able to
      // see WHY it was refused; it is a bank's own rendering of a name the
      // customer already gave us, not new information about them.
      log("error", "payout account name does not match the verified name", { reference });
      await deps.recordFailure(
        `The payout account is in the name "${resolvedName}", which does not match the verified name`,
      );
      return "name_mismatch";
    }
  }

  // ── 4. The claim. Everything past here may call the provider ────────────
  if (!(await deps.claim(reference))) {
    log("warn", "another attempt already owns this withdrawal", { reference });
    return "not_claimed";
  }

  // ── 5. Send it ──────────────────────────────────────────────────────────
  let status: string;
  try {
    const sent = await deps.disburse({
      reference,
      amount,
      currency,
      destination: routed.destination,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
    });
    status = sent.status;
  } catch (err) {
    // THE CASE THIS WHOLE MODULE IS SHAPED AROUND. We do not know whether the
    // payout happened, so we ask. Never a second disburse, never a refund on
    // a guess.
    const message = err instanceof Error ? err.message : String(err);
    log("error", "the payout call did not return cleanly, querying", { reference, message });

    let queried: PayoutQueryResult;
    try {
      queried = await deps.query(reference);
    } catch (queryErr) {
      // Still unknown. The row stays claimed and processing; the reconcile
      // cron asks again. Leaving it held is the safe side of this.
      log("error", "the payout query failed too, leaving it in flight", {
        reference,
        error: queryErr instanceof Error ? queryErr.message : String(queryErr),
      });
      return "pending";
    }

    if (!queried.found) {
      // The provider has never heard of it, so nothing was sent. The claim
      // goes back and the bounded retry applies.
      await deps.releaseClaim(reference, `Payout was not accepted: ${message}`.slice(0, 1000));
      return "released";
    }
    status = queried.status;
  }

  if (isPayoutSuccess(status)) {
    await deps.complete();
    await deps.notifyCompleted();
    return "paid";
  }

  if (isPayoutFailure(status)) {
    const reason = `Payout ${status}`;
    await deps.fail(reason);
    await deps.notifyFailed(reason);
    return "failed";
  }

  // Accepted and still moving. The webhook or the reconcile cron finishes it.
  return "pending";
}

// ── Settling a payout the provider has told us about ────────────────────────

export interface PayoutRow {
  id: string;
  status: string;
}

export interface SettlePayoutDeps {
  /** A FRESH read from the provider. Never the webhook body. */
  query(reference: string): Promise<PayoutQueryResult>;
  findWithdrawalByReference(reference: string): Promise<PayoutRow | null>;
  complete(transactionId: string): Promise<void>;
  fail(transactionId: string, reason: string): Promise<void>;
  notifyCompleted(transactionId: string): Promise<void>;
  notifyFailed(transactionId: string, reason: string): Promise<void>;
  log?(level: "warn" | "error", message: string, detail: Record<string, unknown>): void;
}

export type SettlePayoutOutcome =
  | "completed"
  | "failed"
  | "still_pending"
  | "unknown_reference"
  | "already_settled"
  | "lookup_failed";

/**
 * One path for both triggers — the webhook and the reconcile cron — exactly
 * as settleKorapayCharge is for deposits. The payload is a trigger; the
 * provider's answer to a fresh query is the evidence.
 */
export async function settleKorapayPayout(
  deps: SettlePayoutDeps,
  reference: string,
): Promise<SettlePayoutOutcome> {
  const log = deps.log ?? (() => {});

  const row = await deps.findWithdrawalByReference(reference);
  if (!row) {
    log("error", "no withdrawal matches this payout reference", { reference });
    return "unknown_reference";
  }
  if (row.status !== "pending" && row.status !== "processing") {
    return "already_settled";
  }

  let queried: PayoutQueryResult;
  try {
    queried = await deps.query(reference);
  } catch (err) {
    log("error", "could not query the payout", {
      reference,
      error: err instanceof Error ? err.message : String(err),
    });
    return "lookup_failed";
  }

  if (!queried.found) {
    // Keep the hold. A reference the provider cannot find, on a row we marked
    // as sent, is a question for a human rather than a refund.
    log("error", "the provider has no payout under this reference", { reference });
    return "still_pending";
  }

  if (isPayoutSuccess(queried.status)) {
    await deps.complete(row.id);
    await deps.notifyCompleted(row.id);
    return "completed";
  }

  if (isPayoutFailure(queried.status)) {
    const reason = `Payout ${queried.status}`;
    await deps.fail(row.id, reason);
    await deps.notifyFailed(row.id, reason);
    return "failed";
  }

  return "still_pending";
}

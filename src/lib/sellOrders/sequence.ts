/**
 * The ORDER a sell order settles in, with nothing else in it — the same move
 * src/lib/convert/sequence.ts makes for an interactive conversion, applied to
 * one that a webhook or a cron runs with nobody at a keyboard.
 *
 * WHY THIS IS A SEPARATE FILE
 *
 * `claim` is the only step allowed to be called more than once for the same
 * deposit: the webhook, the reconcile cron and the status poll can all reach
 * this sequence for the same credited deposit, and the database claim
 * (claim_sell_order_for_deposit) is what makes every call after the first a
 * no-op. Lifting the sequence out of the three call sites is what makes
 * "a second caller never re-sells" a thing a test can assert directly,
 * rather than three route handlers the reviewer has to re-read in step.
 *
 * THE RULE THIS ENFORCES: once `claim` hands back a 'received' order, the
 * USDT has already left the user's wallet into a hold. From there exactly
 * one of two things may happen to it — `settle` (the provider executed,
 * money is accounted for) or `creditUsdtFallback` (nothing moved, give it
 * back) — and `quoteAndTransfer` throwing is the ONLY signal that selects
 * the second. A provider call that returns a real transfer, however
 * unsettled its status, must always reach `settle`: the USDT already left
 * at the provider by then, and crediting it back too would be the business
 * paying twice.
 */

export type SellOrderClaimStatus = "received" | "credited_usdt" | "failed";

/** What claim_sell_order_for_deposit handed back for this deposit. */
export interface SellOrderClaim {
  sellOrderId: string;
  userId: string;
  targetCurrency: string;
  /** The amount actually credited — never the order's expected amount. */
  receivedAmount: number;
  flagged: boolean;
  /**
   * 'received' is the only status this sequence still has work to do for.
   * 'credited_usdt' and 'failed' mean the database itself already resolved
   * the order (a suspended account, or a balance that somehow didn't cover
   * it) — the USDT is already where it needs to be, and all that is left is
   * telling the user.
   */
  status: SellOrderClaimStatus;
  /** Present only when status is 'received'. */
  holdId?: string;
}

export interface SellOrderTransferResult<TTransfer> {
  transfer: TTransfer;
  /** True when the transfer's own status means the fiat has actually landed. */
  delivered: boolean;
  targetAmount: number;
  providerReference: string;
  providerRate: number;
  markupRate: number;
  customerRate: number;
}

export interface SellOrderSteps<TTransfer> {
  /** Null when there is nothing linked to this deposit, or it was already claimed. */
  claim: () => Promise<SellOrderClaim | null>;
  /**
   * A fresh route and a fresh provider quote for the claim's RECEIVED
   * amount — never the order's original expected amount — then the
   * transfer. Throwing means nothing moved at the provider — the only case
   * the fallback below is correct for.
   */
  quoteAndTransfer: (claim: SellOrderClaim) => Promise<SellOrderTransferResult<TTransfer>>;
  /** Writes the ledger row from the hold. No second debit. */
  settle: (claim: SellOrderClaim, result: SellOrderTransferResult<TTransfer>) => Promise<string>;
  /** Only when the transfer delivered immediately — the common case. */
  completeConversion: (transactionId: string) => Promise<void>;
  /** The provider never moved anything: USDT goes back to the user's wallet. */
  creditUsdtFallback: (claim: SellOrderClaim, reason: string) => Promise<void>;
  /** "We couldn't sell your USDT automatically" — in-app + email. */
  notifyCreditedUsdt: (sellOrderId: string) => Promise<void>;
  /** Only once the transfer has actually delivered. */
  notifySold: (transactionId: string) => Promise<void>;
}

export type SellOrderOutcome =
  | { status: "skipped" }
  | { status: "credited_usdt" }
  | { status: "sold"; transactionId: string; delivered: boolean };

export async function settleSellOrder<TTransfer>(
  steps: SellOrderSteps<TTransfer>,
): Promise<SellOrderOutcome> {
  const claim = await steps.claim();
  if (!claim) return { status: "skipped" };

  // The database already resolved this one (suspended account, or the
  // "should never happen" insufficient-balance guard) — the USDT is already
  // sitting where it needs to be, so there is nothing left to sequence.
  if (claim.status !== "received") {
    await steps.notifyCreditedUsdt(claim.sellOrderId);
    return { status: "credited_usdt" };
  }

  let result: SellOrderTransferResult<TTransfer>;
  try {
    result = await steps.quoteAndTransfer(claim);
  } catch (err) {
    // NOTHING moved. This is the only case where giving the USDT back is
    // correct — see the file header.
    await steps.creditUsdtFallback(claim, err instanceof Error ? err.message : String(err));
    await steps.notifyCreditedUsdt(claim.sellOrderId);
    return { status: "credited_usdt" };
  }

  const transactionId = await steps.settle(claim, result);

  if (result.delivered) {
    await steps.completeConversion(transactionId);
    await steps.notifySold(transactionId);
  }
  // Not delivered yet: the row stays 'pending' and the existing
  // reconcile-transfers cron — which already sweeps every pending 'convert'
  // transaction regardless of where it came from — completes or fails it
  // later. Nothing further to do here; the money is already accounted for.

  return { status: "sold", transactionId, delivered: result.delivered };
}

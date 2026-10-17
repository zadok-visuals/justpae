/**
 * The ORDER a conversion happens in, with nothing else in it.
 *
 * WHY THIS IS A SEPARATE FILE
 *
 * The bug migration 0022 exists to fix was not a wrong calculation. Every
 * figure in the old executeConversion was right. What was wrong was the
 * sequence: the provider was called, and only then was the PIN checked. No
 * assertion about an amount could have caught that, because no amount was
 * wrong.
 *
 * So the sequence itself is the unit under test. Lifting it out of the server
 * action is what makes "a wrong PIN causes zero provider calls" a thing a test
 * can actually assert, rather than a property the reviewer has to re-derive by
 * reading the action top to bottom every time it changes. Same move this
 * codebase already made for the fee and markup maths (see
 * src/lib/rates/markupMath.ts).
 *
 * The three guarantees, and all three are tested:
 *
 *   1. If the hold fails, the provider is NEVER called.
 *   2. If the provider fails, the hold is ALWAYS released.
 *   3. If anything after the provider fails, the hold is STILL released.
 *
 * Guarantee 3 is the one that is easy to lose later: it is tempting to treat a
 * post-provider failure as "too late to do anything", and the money is the
 * user's either way.
 */

/** What a step returns when it can fail with a message the caller may show. */
export type StepResult<T> = { ok: true; value: T } | { ok: false; error: string; isPinError?: boolean };

/**
 * What the provider step reports back.
 *
 * A fiat-to-fiat conversion is TWO provider legs bridged through USDT, since
 * no direct fiat pair is quoted. That makes a third outcome real, and it is
 * neither success nor failure:
 *
 *   completed  everything the conversion needed from the provider is done.
 *   partial    leg 1 converted the source into USDT; leg 2 did not deliver.
 *              The money moved. It is simply not where it was going.
 *   (throw)    nothing moved — leg 1 itself failed, or this was a one-leg
 *              conversion that failed. The hold is released.
 *
 * "partial" must never take the release path. Releasing refunds the source
 * currency the user no longer has a claim to, while the USDT leg 1 produced
 * stays with the business: a double credit against us. It settles instead,
 * and the USDT goes to the user's own wallet.
 */
export type ProviderResult<TTransfer> =
  | { outcome: "completed"; transfer: TTransfer }
  | { outcome: "partial"; transfer: TTransfer; error: unknown };

export interface ConversionSteps<TTransfer, TQuote> {
  /**
   * Suspension, PIN, destination wallet, balance, and the debit — one
   * database transaction, no provider. Resolves to the hold id.
   */
  beginHold: () => Promise<StepResult<string>>;
  /**
   * The provider call or calls. Throws when NOTHING moved; resolves to a
   * ProviderResult otherwise.
   */
  callProvider: () => Promise<ProviderResult<TTransfer>>;
  /** Records what the provider reported, server-side. */
  writeQuote: (transfer: TTransfer) => Promise<StepResult<TQuote>>;
  /** Writes the ledger row from the hold and the quote. No second debit. */
  settle: (holdId: string, quote: TQuote) => Promise<StepResult<string>>;
  /** Puts the money back. Must not throw — see convert.ts releaseHold. */
  release: (holdId: string, reason: string) => Promise<void>;
  /**
   * Credits the bridge currency leg 1 produced and marks the row
   * partially completed. Only ever called for a "partial" provider result.
   */
  settlePartial: (transactionId: string, reason: string) => Promise<void>;
  /** Turns a thrown provider error into customer-facing text. */
  describeProviderError: (err: unknown) => string;
}

export type ConversionOutcome<TTransfer> =
  | {
      ok: true;
      transactionId: string;
      transfer: TTransfer;
      holdId: string;
      /**
       * "partial" means leg 1 converted and leg 2 did not: the row exists,
       * the bridge currency has been credited, and the caller must NOT go on
       * to complete it.
       */
      outcome: "completed" | "partial";
    }
  | {
      ok: false;
      error: string;
      /** Which step failed. Drives logging, and makes the tests readable. */
      failedAt: "hold" | "provider" | "quote" | "settle";
      /** True once the money is back with the user. False only for a hold that never happened. */
      released: boolean;
      isPinError?: boolean;
    };

export async function runConversion<TTransfer, TQuote>(
  steps: ConversionSteps<TTransfer, TQuote>,
): Promise<ConversionOutcome<TTransfer>> {
  // ── 1. Everything that can refuse, before anything irreversible ──────────
  const held = await steps.beginHold();
  if (!held.ok) {
    // Nothing was held, so there is nothing to release, and — the point of the
    // whole exercise — the provider has not been called.
    return { ok: false, error: held.error, failedAt: "hold", released: false, isPinError: held.isPinError };
  }
  const holdId = held.value;

  // ── 2. The provider ──────────────────────────────────────────────────────
  let provider: ProviderResult<TTransfer>;
  try {
    provider = await steps.callProvider();
  } catch (err) {
    // A throw means NOTHING moved. That is the only case where giving the
    // source currency back is correct.
    await steps.release(holdId, err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      error: steps.describeProviderError(err),
      failedAt: "provider",
      released: true,
    };
  }

  const { transfer } = provider;

  // ── 3. Record what it said ───────────────────────────────────────────────
  const quoted = await steps.writeQuote(transfer);
  if (!quoted.ok) {
    await steps.release(holdId, "Quote write failed after the provider executed.");
    return { ok: false, error: quoted.error, failedAt: "quote", released: true };
  }

  // ── 4. The ledger row ────────────────────────────────────────────────────
  const settled = await steps.settle(holdId, quoted.value);
  if (!settled.ok) {
    await steps.release(holdId, "Ledger write failed after the provider executed.");
    return { ok: false, error: settled.error, failedAt: "settle", released: true };
  }

  // ── 5. A half-done conversion is settled, not released ───────────────────
  // The row now owns the hold, so the money is accounted for. What is left is
  // to put the USDT leg 1 produced into the user's own wallet and mark the
  // row for what it is.
  if (provider.outcome === "partial") {
    await steps.settlePartial(
      settled.value,
      provider.error instanceof Error ? provider.error.message : String(provider.error),
    );
  }

  return {
    ok: true,
    transactionId: settled.value,
    transfer,
    holdId,
    outcome: provider.outcome,
  };
}

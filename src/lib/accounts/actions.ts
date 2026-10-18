import type { Currency } from "@/lib/types/database";
import { depositAvailability } from "@/lib/deposits/availability";
import { isAutomatablePayoutCurrency } from "@/lib/busha/payout";
import { USD_COLLECTION_ENABLED } from "@/lib/flags";
import { USD_CONVERSION_UNAVAILABLE, currencyMeta } from "@/lib/currencies";

/**
 * What a user can actually DO with one wallet, and when they can't, why.
 *
 * THIS MODULE DECIDES NOTHING. Every rule it reports is owned somewhere else
 * and read from there:
 *
 *   can it be funded      src/lib/deposits/availability.ts
 *   can it be paid out    src/lib/busha/payout.ts (a channel, or the manual queue)
 *   is a feature on       src/lib/flags.ts
 *   can it be converted    src/lib/rates/routes.ts, resolved live by the caller
 *
 * The reason that matters: the deposit page, the withdraw page and the
 * account pages had no shared answer to "is this allowed", so the account
 * pages would have had to restate three sets of rules that already exist. A
 * restated rule is a rule that drifts — GHS comes back and one of the four
 * screens keeps saying it is down.
 *
 * What is genuinely new here is the one-line CUSTOMER SENTENCE for a disabled
 * action on an account page, which is a presentation decision and has no home
 * anywhere else. Where the owning module already phrases it well, that phrase
 * is used verbatim rather than paraphrased.
 */

export type AccountActionKey = "add" | "convert" | "withdraw" | "payToChina";

export interface AccountAction {
  key: AccountActionKey;
  label: string;
  href: string;
  /** Null when the action can be taken. Otherwise the one line explaining why not. */
  disabledReason: string | null;
  /**
   * Shown under an ENABLED action when there is a condition worth knowing
   * before tapping — a GHS withdrawal going to a human rather than straight
   * out, most of all. Not a blocker; a warning.
   */
  note: string | null;
}

/**
 * Whether this currency can be converted at all, and why not.
 *
 * USD is answered without a provider call because its answer is a standing
 * fact about this account rather than a live condition — see
 * USD_CONVERSION_UNAVAILABLE. Every other currency needs a live route lookup,
 * which the CALLER does (resolveRoutesFrom / listRoutesFrom) and passes in:
 * this module stays synchronous and free of provider calls so a listing page
 * can use it for five wallets without five round trips.
 */
export interface ConvertAvailability {
  available: boolean;
  reason: string | null;
}

export function staticConvertAvailability(currency: Currency): ConvertAvailability | null {
  if (currency === "USD") return { available: false, reason: USD_CONVERSION_UNAVAILABLE };
  return null;
}

/**
 * Whether this currency can be withdrawn, and how.
 *
 * Three outcomes, not two:
 *
 *   automated  a payout channel exists (NGN, KES, USDT) — it goes straight out.
 *   manual     no channel, but the money is still the user's and a human can
 *              send it. GHS. Offering it is correct; pretending it is instant
 *              is not.
 *   never      USD. There is no USD payout on this account at all, and the
 *              honest instruction is to convert it rather than to wait.
 */
export function withdrawAvailability(currency: Currency): {
  mode: "automated" | "manual" | "never";
  reason: string | null;
} {
  if (currency === "USD") {
    // Matches requestWithdrawal's own refusal (src/lib/actions/withdrawals.ts),
    // so the screen and the server say the same thing.
    return {
      mode: "never",
      reason: "Dollars can't be sent out directly. Convert to spend or withdraw it.",
    };
  }

  if (isAutomatablePayoutCurrency(currency)) return { mode: "automated", reason: null };

  return {
    mode: "manual",
    reason: "Withdrawals in this currency are reviewed by our team before they go out.",
  };
}

/**
 * The action row for one wallet.
 *
 * `convert` is passed in rather than resolved here — see
 * ConvertAvailability. A caller that cannot afford the live lookup passes
 * null and gets the action enabled, which is the right default: /convert
 * itself disables every dead destination with its own reason, so the worst
 * case is one extra tap rather than a dead end.
 */
export function accountActions(
  currency: Currency,
  convert: ConvertAvailability | null = null,
): AccountAction[] {
  const actions: AccountAction[] = [];

  // ── Add money ───────────────────────────────────────────────────────────
  // USD is the exception, and not a cosmetic one: dollars do not arrive by
  // depositing, they arrive by someone sending them to receiving details. So
  // the action goes to /receive and says so, rather than offering a deposit
  // that has no rail behind it.
  if (currency === "USD") {
    actions.push({
      key: "add",
      label: "Receive dollars",
      href: "/receive",
      disabledReason: USD_COLLECTION_ENABLED
        ? null
        : "Dollar receiving details are coming soon. You'll see them here the moment they're live.",
      note: null,
    });
  } else {
    const deposit = depositAvailability(currency);
    actions.push({
      key: "add",
      label: "Add money",
      href: `/deposit?currency=${currency}`,
      disabledReason: deposit.available ? null : deposit.reason,
      note: null,
    });
  }

  // ── Convert ─────────────────────────────────────────────────────────────
  const convertState = convert ?? staticConvertAvailability(currency);
  actions.push({
    key: "convert",
    label: `Convert ${currency}`,
    href: `/convert?currency=${currency}`,
    disabledReason: convertState && !convertState.available ? convertState.reason : null,
    note: null,
  });

  // ── Withdraw ────────────────────────────────────────────────────────────
  const withdraw = withdrawAvailability(currency);
  actions.push({
    key: "withdraw",
    label: "Withdraw",
    href: `/withdraw?currency=${currency}`,
    disabledReason: withdraw.mode === "never" ? withdraw.reason : null,
    note: withdraw.mode === "manual" ? withdraw.reason : null,
  });

  return actions;
}

/**
 * How money gets into this wallet, in the words a user needs BEFORE they tap
 * anything.
 *
 * Not marketing copy: each line describes the mechanism the deposit flow
 * actually uses for that currency — a one-shot transfer account for the fiat
 * rails, a chain address for USDT — because the single most expensive deposit
 * mistake is reusing details that were only ever good for one transfer.
 */
export function howToAddMoney(currency: Currency): string {
  switch (currency) {
    case "USD":
      return "Dollars arrive from someone sending them to your receiving details. There's nothing to deposit — share the details and the money lands here.";
    case "USDT":
      return "Send USDT on BSC to the address we generate for you. Only BSC — anything sent on another network can't be recovered.";
    case "NGN":
    case "KES":
      return `Start on Add money, enter the amount, and we'll generate transfer details for that one deposit. Send exactly that amount before the details expire and your ${currency} wallet is credited automatically.`;
    default:
      return `Start on Add money and we'll generate transfer details for that one deposit, then credit your ${currencyMeta(currency).label} wallet once it lands.`;
  }
}

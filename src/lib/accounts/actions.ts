import type { Currency } from "@/lib/types/database";
import { depositAvailability } from "@/lib/deposits/availability";
import { isAutomatablePayoutCurrency } from "@/lib/busha/payout";
import { USD_COLLECTION_ENABLED } from "@/lib/flags";
import { USD_CONVERSION_UNAVAILABLE, currencyMeta } from "@/lib/currencies";
import { cnyRouteBlocker, cnyBlockerKind } from "@/lib/cny/priceCore";
import { usdWithdrawalError } from "@/lib/withdrawals/rules";
import type { UnavailableKind } from "@/lib/ui/unavailability";

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
   * GROUP 4f. The one-word form of `disabledReason`, so the muted circle in
   * the action row can carry a badge naming the state instead of relying on
   * the user tapping it to find out. Null exactly when `disabledReason` is.
   *
   * The sentence is still the real answer and still one tap away — this is
   * the glance-level version, and the whole reason it exists is that "muted
   * circle, no label" and "muted circle, Maintenance" are read completely
   * differently by somebody deciding whether to give up on the product.
   */
  disabledKind: UnavailableKind | null;
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
  /** GROUP 4f. The one word, carried from whichever route refused. */
  kind?: UnavailableKind | null;
}

export function staticConvertAvailability(currency: Currency): ConvertAvailability | null {
  if (currency === "USD") {
    // Not maintenance: there is no USDT/USD pair on this account and there is
    // no work in progress that would create one.
    return { available: false, reason: USD_CONVERSION_UNAVAILABLE, kind: "unsupported" };
  }
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
 *   never      USD and CNY. Neither has a payout on this account at all, and
 *              the honest instruction is to convert or spend rather than wait.
 */
export function withdrawAvailability(currency: Currency): {
  mode: "automated" | "manual" | "never";
  reason: string | null;
} {
  if (currency === "CNY") {
    // Not a policy this module is choosing: migration 0026 puts a trigger on
    // `transactions` that refuses a CNY withdrawal outright, because a
    // synthetic balance leaving through a payout rail would be the business
    // paying out real money against an obligation it created for itself.
    // Without this branch the fallthrough below calls it "manual" and offers
    // a flow guaranteed to fail — the dead end the whole account-page audit
    // exists to remove. The sentence is the trigger's own.
    return {
      mode: "never",
      reason: "Yuan can't be withdrawn. Spend it with Pay to China, or convert it first.",
    };
  }

  const usdReason = usdWithdrawalError(currency);
  if (usdReason) {
    // GROUP 2b. Reads requestWithdrawal's own refusal
    // (src/lib/withdrawals/rules.ts) instead of a second copy of the
    // sentence, so the screen and the server cannot drift apart again.
    return { mode: "never", reason: usdReason };
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
      // GROUP 4f, closing QA 4.5. This said "coming soon", which is the one
      // phrase MaintenanceBadge exists to remove: the receiving-details screen
      // is built, the schema is there and the interface is waiting on a
      // provider — so it is a thing this product does and cannot do today,
      // which is the definition of maintenance rather than of a feature that
      // was never promised.
      disabledReason: USD_COLLECTION_ENABLED
        ? null
        : "Dollar receiving details are under maintenance while we finish setup. You'll see them here the moment they're live.",
      disabledKind: USD_COLLECTION_ENABLED ? null : "maintenance",
      note: null,
    });
  } else if (currency === "CNY") {
    // GROUP 4d. Yuan is not deposited and never has been — there is no CNY
    // pay-in rail on this account, and the balance exists because somebody
    // converted into it. The page used to offer "Add money" anyway, pointing
    // at /deposit?currency=CNY, where the currency is not selectable: a dead
    // link sitting directly above a paragraph headed "Adding money" that
    // described a bank transfer which cannot happen.
    //
    // So the action becomes what it actually is. Enabled, not disabled —
    // there is a real, working way to put yuan in this wallet, and marking
    // it unavailable would be the same lie in the other direction.
    actions.push({
      key: "add",
      label: "Convert to CNY",
      href: "/convert?to=CNY",
      disabledReason: null,
      disabledKind: null,
      note: "Yuan is added by converting from another wallet.",
    });
  } else {
    const deposit = depositAvailability(currency);
    actions.push({
      key: "add",
      // GROUP 3a. "Deposit" everywhere, not "Add money" — see AccountActions.tsx.
      label: "Deposit",
      href: `/deposit?currency=${currency}`,
      disabledReason: deposit.available ? null : deposit.reason,
      disabledKind: deposit.available ? null : deposit.kind,
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
    // The caller resolves the live route and passes its kind through; a caller
    // that only has the static answer gets "unsupported" from
    // staticConvertAvailability. Falling back to maintenance would be wrong
    // for USD, which is the one currency this branch definitely covers.
    disabledKind:
      convertState && !convertState.available ? (convertState.kind ?? "maintenance") : null,
    note: null,
  });

  // ── Pay to China ────────────────────────────────────────────────────────
  // A yuan balance pays directly; every other wallet buys the yuan on the way
  // through, which is why this is offered on NGN, KES and USDT and not only
  // on CNY. The refusal for USD and GHS is cnyRouteBlocker's own sentence,
  // not a paraphrase — the form will say exactly the same thing, because it
  // asks the same function.
  const payToChinaBlocker = currency === "CNY" ? null : cnyRouteBlocker(currency);
  actions.push({
    key: "payToChina",
    label: "Pay to China",
    href: `/pay-to-china?currency=${currency}`,
    disabledReason: payToChinaBlocker,
    disabledKind: payToChinaBlocker === null ? null : cnyBlockerKind(currency),
    note:
      payToChinaBlocker === null && currency !== "CNY"
        ? "Your yuan is bought as the payment goes out, at the rate you're shown."
        : null,
  });

  // ── Withdraw ────────────────────────────────────────────────────────────
  const withdraw = withdrawAvailability(currency);
  actions.push({
    key: "withdraw",
    label: "Withdraw",
    href: `/withdraw?currency=${currency}`,
    disabledReason: withdraw.mode === "never" ? withdraw.reason : null,
    // "never" means exactly that — a trigger refusal for CNY, no payout rail
    // for USD. Neither is waiting on anything, so neither is maintenance.
    disabledKind: withdraw.mode === "never" ? "unsupported" : null,
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
    // GROUP 4d. Yuan has no pay-in rail on this account: there is no bank
    // transfer, no address, nothing to send money TO. The old default case
    // caught CNY and told the user to "start on Add money and we'll generate
    // transfer details" — describing a mechanism that does not exist, under a
    // heading that said "Adding money", directly above a tile linking to a
    // deposit screen where yuan cannot be selected.
    case "CNY":
      return "Yuan isn't deposited — it's bought by converting from another wallet. Convert naira, shillings or USDT into yuan and the balance lands here, ready to spend with Pay to China.";
    case "NGN":
    case "KES":
      return `Start on Add money, enter the amount, and we'll generate transfer details for that one deposit. Send exactly that amount before the details expire and your ${currency} wallet is credited automatically.`;
    // GHS, whose deposits are under maintenance. The sentence still describes
    // the mechanism honestly; the Add money action beside it carries the
    // maintenance state, so this is not the place to repeat it.
    default:
      return `Start on Add money and we'll generate transfer details for that one deposit, then credit your ${currencyMeta(currency).label} wallet once it lands.`;
  }
}

/**
 * The heading above howToAddMoney.
 *
 * "Adding money" is wrong for the two currencies that are not added by
 * depositing — Group 4d's contradiction was as much the heading as the
 * paragraph under it.
 */
export function howToAddMoneyHeading(currency: Currency): string {
  if (currency === "CNY") return "Getting yuan";
  if (currency === "USD") return "Receiving dollars";
  return "Adding money";
}

// Relative, extension-bearing imports: currencyPicker.test.ts runs under
// `node --test` with no bundler and therefore no "@/" alias resolution.
// Everything reached from here is import-free, type-only, or already written
// to the same rule (services.ts, deposits/availability.ts).
import type { Currency } from "../types/database.ts";
import { isWalletLocked } from "../services.ts";
import { depositAvailability } from "../deposits/availability.ts";
import { currencyMeta } from "../currencies.ts";
import { MAINTENANCE_LABEL, SOON_LABEL, UNAVAILABLE_LABEL } from "./unavailability.ts";

/**
 * GROUP 1 — what every currency list in this product contains, and in what
 * order.
 *
 * The component that DRAWS the list is src/components/ui/CurrencyPicker.tsx.
 * This module decides what goes in it, and it is separate for two reasons:
 * the rules are the part worth unit-testing, and a picker that worked out its
 * own availability would be a fourth copy of rules that already live in
 * services.ts, deposits/availability.ts and busha/payout.ts. Nothing here
 * invents a rule — it reads them and turns each answer into a row.
 */

export interface CurrencyOptionData {
  currency: Currency;
  /** Shown on the right when the list is about wallets rather than filters. */
  balance?: number;
  /** The neutral grey pill. Any state at all, never a reason sentence. */
  pill?: string;
  /** Muted and not selectable. */
  disabled?: boolean;
  /**
   * Where CHOOSING this row goes, instead of selecting it. The withdraw
   * picker's only use: a currency with no saved payout account is not broken
   * and must not be greyed out — picking it should take the user to the form
   * that fixes it.
   */
  href?: string;
}

/**
 * THE ORDER, everywhere.
 *
 *   1. local fiat — naira then shillings, the two wallets a customer actually
 *      holds money in;
 *   2. USDT, the currency everything is priced through;
 *   3. CNY, which only some flows allow at all;
 *   4. the switched-off ones, at the bottom.
 *
 * Unavailable rows sort below available ones regardless of currency, so a
 * naira wallet whose rail is down drops out of first place rather than
 * sitting at the top of a list it cannot be picked from.
 */
const PICKER_ORDER: Currency[] = ["NGN", "KES", "USDT", "CNY", "GHS", "USD"];

export function currencyPickerRank(currency: Currency): number {
  const index = PICKER_ORDER.indexOf(currency);
  return index === -1 ? PICKER_ORDER.length : index;
}

export function sortCurrencyOptions<T extends CurrencyOptionData>(options: T[]): T[] {
  return [...options].sort((a, b) => {
    const byState = Number(Boolean(a.disabled)) - Number(Boolean(b.disabled));
    if (byState !== 0) return byState;
    return currencyPickerRank(a.currency) - currencyPickerRank(b.currency);
  });
}

/**
 * GROUP 1c — the pill on a wallet whose currency is switched off, or null
 * when it is usable.
 *
 * GHS says "Maintenance": cedi rails exist and are down. USD says "Soon":
 * there is nothing to repair, because the dollar wallet has never opened.
 */
export function walletLockLabel(currency: Currency): string | null {
  if (!isWalletLocked(currency)) return null;
  return currency === "USD" ? SOON_LABEL : MAINTENANCE_LABEL;
}

interface WalletLike {
  currency: Currency;
  balance: number;
}

/**
 * GROUP 1d — CNY is REMOVED from deposit and withdraw rather than listed
 * with a reason.
 *
 * A row that explains why it cannot be used is right when the user might
 * reasonably expect it to work. Nobody expects to deposit yuan: it has no
 * pay-in rail anywhere and never has, and it cannot leave through a payout
 * channel at all (migration 0026 refuses it in the database). Listing it to
 * say so is one more row to read past on every deposit.
 */
export function withoutCny(wallets: WalletLike[]): WalletLike[] {
  return wallets.filter((w) => w.currency !== "CNY");
}

/** /deposit. Yuan is bought, not deposited, so it is not here at all. */
export function depositPickerOptions(wallets: WalletLike[]): CurrencyOptionData[] {
  return sortCurrencyOptions(
    withoutCny(wallets).map((wallet) => {
      const locked = walletLockLabel(wallet.currency);
      if (locked) return { currency: wallet.currency, pill: locked, disabled: true };

      const info = depositAvailability(wallet.currency);
      if (info.available) return { currency: wallet.currency };
      return {
        currency: wallet.currency,
        pill: UNAVAILABLE_LABEL[info.kind],
        disabled: true,
      };
    }),
  );
}

/**
 * /withdraw. Balances are shown — the amount available is the thing being
 * decided — and a currency with no saved destination is SELECTABLE, carrying
 * the form it needs rather than a dead "Setup" tag.
 */
export function withdrawPickerOptions(
  wallets: WalletLike[],
  recipientCurrencies: Currency[],
  payoutFormHref = "/profile",
): CurrencyOptionData[] {
  const saved = new Set(recipientCurrencies);
  return sortCurrencyOptions(
    withoutCny(wallets).map((wallet) => {
      const locked = walletLockLabel(wallet.currency);
      if (locked) {
        return { currency: wallet.currency, balance: wallet.balance, pill: locked, disabled: true };
      }
      if (!saved.has(wallet.currency)) {
        return {
          currency: wallet.currency,
          balance: wallet.balance,
          pill: "Add payout account",
          href: payoutFormHref,
        };
      }
      return { currency: wallet.currency, balance: wallet.balance };
    }),
  );
}

/**
 * /convert. Yuan STAYS: it is bought and sold here, and this is the only
 * screen where that is true.
 *
 * `blockedKinds` is the live route table the page already resolved — this
 * module never asks a provider anything.
 */
export function convertPickerOptions(
  wallets: WalletLike[],
  options: {
    blockedKinds?: Partial<Record<Currency, string>>;
    showBalance?: boolean;
  } = {},
): CurrencyOptionData[] {
  const { blockedKinds = {}, showBalance = false } = options;
  return sortCurrencyOptions(
    wallets.map((wallet) => {
      const balance = showBalance ? wallet.balance : undefined;
      const locked = walletLockLabel(wallet.currency);
      if (locked) return { currency: wallet.currency, balance, pill: locked, disabled: true };

      const blocked = blockedKinds[wallet.currency];
      if (blocked) return { currency: wallet.currency, balance, pill: blocked, disabled: true };
      return { currency: wallet.currency, balance };
    }),
  );
}

/**
 * GROUP — sell orders (migration 0046). /sell's "Receive in" picker: the
 * fiat currencies the user holds, NGN selectable, every other one "Soon" —
 * selling into a currency the flow has not opened for yet would promise a
 * credit this screen cannot deliver. Not the same question as
 * depositPickerOptions or isWalletLocked: a sell credits by CONVERSION, so
 * a wallet that is otherwise perfectly live (KES, say) can still be "Soon"
 * here specifically, on purpose, while the feature rolls out one currency
 * at a time.
 */
export function sellTargetPickerOptions(wallets: WalletLike[]): CurrencyOptionData[] {
  return sortCurrencyOptions(
    withoutCny(wallets)
      .filter((w) => currencyMeta(w.currency).kind === "fiat")
      .map((wallet) =>
        wallet.currency === "NGN"
          ? { currency: wallet.currency }
          : { currency: wallet.currency, pill: SOON_LABEL, disabled: true },
      ),
  );
}

/**
 * Pay to China funding and bill payment: spend from a wallet that has
 * something in it. An empty wallet is listed and muted rather than hidden,
 * so the absence of a currency is never mistaken for the product dropping it.
 */
export function fundingPickerOptions(wallets: WalletLike[]): CurrencyOptionData[] {
  return sortCurrencyOptions(
    wallets.map((wallet) => {
      const locked = walletLockLabel(wallet.currency);
      if (locked) {
        return { currency: wallet.currency, balance: wallet.balance, pill: locked, disabled: true };
      }
      if (wallet.balance <= 0) {
        return { currency: wallet.currency, balance: wallet.balance, pill: "Empty", disabled: true };
      }
      return { currency: wallet.currency, balance: wallet.balance };
    }),
  );
}

/** /profile → payout destinations. "Saved" is a state, so it is a pill. */
export function payoutAccountPickerOptions(
  currencies: Currency[],
  savedCurrencies: Currency[],
): CurrencyOptionData[] {
  const saved = new Set(savedCurrencies);
  return sortCurrencyOptions(
    currencies.map((currency) => ({
      currency,
      pill: saved.has(currency) ? "Saved" : undefined,
    })),
  );
}

/**
 * Admin filters. No balances, no availability: an operator filters the ledger
 * by a currency precisely when something about it has gone wrong, so nothing
 * here is disabled.
 */
export function adminCurrencyOptions(currencies: Currency[]): CurrencyOptionData[] {
  return sortCurrencyOptions(currencies.map((currency) => ({ currency })));
}

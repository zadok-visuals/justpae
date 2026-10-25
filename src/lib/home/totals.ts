// Relative, extension-bearing imports: this module is covered by totals.test.ts,
// which runs under `node --test` with no path-alias resolver.
import type { Currency } from "../types/database.ts";

/**
 * The total balance on Home, and the honesty rules around it.
 *
 * A single figure across six currencies is only ever an estimate, so the two
 * things that could mislead are both carried out of here rather than being
 * decided by the component:
 *
 *   approx    true as soon as any wallet had to be converted to join the
 *             total. The card says "approx." only when that is the case —
 *             a naira-only user looking at their naira total is not reading
 *             an estimate.
 *   excluded  a wallet whose pair cannot be priced, or whose currency is
 *             locked, is LEFT OUT and named. Silently pricing it at zero
 *             would understate someone's money, which is the one direction
 *             this must never be wrong in.
 */

export type DisplayCurrency = "local" | "usdt";

export const DISPLAY_CURRENCY_COOKIE = "jp-display";
export const HIDE_AMOUNTS_COOKIE = "jp-hide-amounts";

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return value === "local" || value === "usdt";
}

export interface PricedWallet {
  currency: Currency;
  balance: number;
  /**
   * Local units per 1 USDT — the sell price, which is what the holder would
   * actually get. Null when the pair cannot be priced; 1 for USDT itself.
   */
  usdtRate: number | null;
  /** Locked currencies are excluded whatever their rate. */
  locked?: boolean;
}

export interface TotalBalance {
  amount: number;
  approx: boolean;
  excluded: Currency[];
}

/** Everything the user holds, expressed in USDT. */
export function totalInUsdt(wallets: PricedWallet[]): TotalBalance {
  let amount = 0;
  let converted = 0;
  const excluded: Currency[] = [];

  for (const wallet of wallets) {
    if (wallet.locked) {
      if (wallet.balance !== 0) excluded.push(wallet.currency);
      continue;
    }
    if (wallet.currency === "USDT") {
      amount += wallet.balance;
      continue;
    }
    if (wallet.usdtRate == null || wallet.usdtRate <= 0) {
      if (wallet.balance !== 0) excluded.push(wallet.currency);
      continue;
    }
    amount += wallet.balance / wallet.usdtRate;
    if (wallet.balance !== 0) converted += 1;
  }

  return { amount, approx: converted > 0, excluded };
}

/**
 * The same total in one local currency. Converting the USDT total back out is
 * deliberate: it keeps the two figures on the switcher consistent with each
 * other, so flipping local ⇄ USDT never shows two amounts that disagree.
 */
export function totalInLocal(
  wallets: PricedWallet[],
  localCurrency: Currency,
  localRate: number | null,
): TotalBalance | null {
  if (localRate == null || localRate <= 0) return null;
  const usdt = totalInUsdt(wallets);

  // A naira-only balance shown in naira is exact, not an estimate — and
  // round-tripping it through USDT would both say "approx." and introduce a
  // floating-point tail on a number the user can check against their own
  // wallet card.
  const held = wallets.filter((w) => !w.locked && w.balance !== 0);
  if (held.length > 0 && held.every((w) => w.currency === localCurrency)) {
    return {
      amount: held.reduce((sum, w) => sum + w.balance, 0),
      approx: false,
      excluded: usdt.excluded,
    };
  }

  return { amount: usdt.amount * localRate, approx: usdt.approx, excluded: usdt.excluded };
}

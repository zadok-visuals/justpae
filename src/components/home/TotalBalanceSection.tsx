import { cookies } from "next/headers";
import { TotalBalanceCard } from "@/components/home/TotalBalanceCard";
import { CURRENCIES, formatAmount } from "@/lib/currencies";
import { resolveRateBoard } from "@/lib/rates/display";
import { isWalletLocked } from "@/lib/services";
import {
  DISPLAY_CURRENCY_COOKIE,
  HIDE_AMOUNTS_COOKIE,
  isDisplayCurrency,
  totalInLocal,
  totalInUsdt,
  type PricedWallet,
} from "@/lib/home/totals";
import type { Currency, Wallet } from "@/lib/types/database";

/**
 * The total, computed on the server.
 *
 * The rates come from the same cached board the rate card reads (30s,
 * src/lib/rates/cache.ts), so showing a total costs no extra provider round
 * trip — and no rate is ever sent to the browser, which is the rule every
 * amount in this product follows.
 *
 * Awaited inside its own Suspense boundary by the page, for the reason the
 * rate board already is: this is six provider calls, and a balance card is
 * not worth holding the whole screen for.
 */
export async function TotalBalanceSection({
  wallets,
  country,
}: {
  wallets: Wallet[];
  country: string | null | undefined;
}) {
  const store = await cookies();
  const cookieDisplay = store.get(DISPLAY_CURRENCY_COOKIE)?.value;
  const initialDisplay = isDisplayCurrency(cookieDisplay) ? cookieDisplay : "local";
  const initialHidden = store.get(HIDE_AMOUNTS_COOKIE)?.value === "1";

  const localCurrency = localCurrencyFor(country);
  const board = await resolveRateBoard();
  // The SELL price: local units the holder would actually receive for 1 USDT.
  const rateFor = (currency: Currency): number | null =>
    board.find((pair) => pair.currency === currency)?.sellPrice ?? null;

  const priced: PricedWallet[] = wallets.map((wallet) => ({
    currency: wallet.currency,
    balance: Number(wallet.balance),
    usdtRate: wallet.currency === "USDT" ? 1 : rateFor(wallet.currency),
    locked: isWalletLocked(wallet.currency),
  }));

  const usdt = totalInUsdt(priced);
  const local = totalInLocal(priced, localCurrency, rateFor(localCurrency));

  return (
    <TotalBalanceCard
      localLabel={localCurrency}
      initialDisplay={initialDisplay}
      initialHidden={initialHidden}
      usdt={{
        formatted: formatAmount("USDT", usdt.amount),
        approx: usdt.approx,
        excluded: usdt.excluded,
      }}
      local={
        local && {
          formatted: formatAmount(localCurrency, local.amount),
          approx: local.approx,
          excluded: local.excluded,
        }
      }
    />
  );
}

/** The currency of the country on the profile, naira when there isn't one. */
function localCurrencyFor(country: string | null | undefined): Currency {
  const match = CURRENCIES.find((c) => c.country && c.country === country);
  return match?.code ?? "NGN";
}

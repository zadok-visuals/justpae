// Relative, with extensions: preselect.test.ts runs under `node --test` with
// no bundler and therefore no "@/" alias resolution, same rule as
// currencyPicker.ts.
import type { Currency } from "../types/database.ts";
import { currencyMeta, isCurrency } from "../currencies.ts";
import { currencyPickerRank } from "../ui/currencyPicker.ts";

/**
 * Reading `?currency=` off a money screen's URL, safely.
 *
 * Every entry point into /deposit, /convert and /withdraw now carries one —
 * the account pages, Home's Add money sheet, the wallet cards. The whole
 * point is that the screen opens on the wallet the user meant, so the amount
 * field is the next thing they touch rather than the currency select.
 *
 * THE FALLBACK IS THE INTERESTING PART. A currency can arrive here that is
 * spelled correctly, exists in the config, and is still wrong for this
 * screen: a user with no cedi wallet typing /deposit?currency=GHS, a stale
 * bookmark to a currency whose rail has since gone down, or a link from an
 * account page to an action that currency cannot take. None of those should
 * produce an error page — the user asked for a screen that exists and is
 * entitled to it — and none should silently select something unusable
 * either. So an unusable request falls back to the first currency the screen
 * CAN serve, and the screen's own banner then explains what it can and
 * cannot do.
 *
 * Shared rather than written three times, because three copies of "validate,
 * check membership, fall back" is three chances to forget the membership
 * check and preselect a currency the form cannot submit.
 */
export function parseCurrencyParam(
  value: string | string[] | undefined,
): Currency | null {
  // A repeated query param arrives as an array; the first is the only sane
  // reading of ?currency=NGN&currency=KES.
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const upper = raw.toUpperCase();
  return isCurrency(upper) ? upper : null;
}

/**
 * The default when nothing was asked for: the first available FIAT wallet,
 * in the shared CurrencyPicker order (NGN, then KES), never USDT.
 *
 * WHY NOT JUST `list[0]`. The list arrives in whatever order the wallets
 * query returned, which is database order, not the order a customer should
 * be offered things in — and for some signups that happened to be USDT.
 * Opening Home's Deposit tile onto a USDT amount field, for a naira holder
 * who has never touched crypto, is the wrong first screen to show someone
 * who has not asked for one yet.
 *
 * USDT is still the answer when it is the only thing in the list — a user
 * holding only USDT is not shown an empty state over a currency they don't
 * have — which is why this falls through to the picker's own order rather
 * than refusing to return anything for a fiat-less list.
 */
function firstByPickerOrder(list: Currency[]): Currency | undefined {
  if (list.length === 0) return undefined;
  const sorted = [...list].sort(
    (a, b) => currencyPickerRank(a) - currencyPickerRank(b),
  );
  return sorted.find((c) => currencyMeta(c).kind === "fiat") ?? sorted[0];
}

/**
 * The currency a screen should open on.
 *
 * `usable` is the list this particular screen can actually act on — wallets
 * with a deposit rail, wallets with a payout destination, wallets with a live
 * conversion route. `all` is everything the user holds, used only as the last
 * resort so a screen with nothing usable still renders a sensible selection
 * and explains itself rather than rendering blank.
 */
export function preselectCurrency(
  requested: Currency | null,
  usable: Currency[],
  all: Currency[],
): Currency | undefined {
  if (requested && usable.includes(requested)) return requested;
  // A requested currency the user genuinely holds but cannot use HERE is
  // still the better selection than an unrelated one: the screen's banner is
  // then about the currency they asked about, which is the question they
  // came with.
  if (requested && all.includes(requested)) return requested;
  return firstByPickerOrder(usable) ?? firstByPickerOrder(all);
}

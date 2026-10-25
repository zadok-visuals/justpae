"use server";

import { cookies } from "next/headers";
import {
  DISPLAY_CURRENCY_COOKIE,
  HIDE_AMOUNTS_COOKIE,
  isDisplayCurrency,
  type DisplayCurrency,
} from "@/lib/home/totals";

/**
 * Two cookies, a year each. No account needed and nothing sensitive in
 * either: which currency the total is shown in, and whether amounts are
 * hidden. Both are applied in the browser the moment they are clicked —
 * these writes are only so the next load remembers.
 */
const YEAR = 60 * 60 * 24 * 365;

export async function setDisplayCurrency(value: DisplayCurrency): Promise<{ error?: string }> {
  if (!isDisplayCurrency(value)) return { error: "Not a display currency." };
  const store = await cookies();
  store.set(DISPLAY_CURRENCY_COOKIE, value, { path: "/", maxAge: YEAR, sameSite: "lax" });
  return {};
}

export async function setAmountsHidden(hidden: boolean): Promise<{ error?: string }> {
  const store = await cookies();
  store.set(HIDE_AMOUNTS_COOKIE, hidden ? "1" : "0", { path: "/", maxAge: YEAR, sameSite: "lax" });
  return {};
}

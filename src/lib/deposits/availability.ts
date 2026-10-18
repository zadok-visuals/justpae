import type { Currency } from "@/lib/types/database";
import { KLASHA_GHS_DEPOSIT_ENABLED } from "@/lib/flags";

/**
 * Which currencies can be deposited, and through which provider.
 *
 * This lives in its own module rather than beside the deposit actions because
 * EVERY export of a `"use server"` file must be an async function — Next.js
 * treats each one as a callable server action. A synchronous helper exported
 * from there fails the build, and making it async purely to satisfy that rule
 * would force every caller to await a pure lookup.
 *
 * The mapping is the result of live testing, not preference:
 *   NGN, KES, USDT  primary provider, confirmed working
 *   GHS             secondary provider, because the primary rejects GHS
 *                   outright on this account. Behind a flag that ships OFF.
 *   USD             not depositable. Dollars arrive via /receive.
 */

const BUSHA_DEPOSIT_CURRENCIES: Currency[] = ["NGN", "KES", "USDT"];

export type DepositAvailability =
  | { available: true; provider: "busha" | "klasha" }
  | { available: false; reason: string };

export function depositAvailability(currency: Currency): DepositAvailability {
  if (BUSHA_DEPOSIT_CURRENCIES.includes(currency)) {
    return { available: true, provider: "busha" };
  }

  if (currency === "GHS") {
    return KLASHA_GHS_DEPOSIT_ENABLED
      ? { available: true, provider: "klasha" }
      : {
          available: false,
          // "Under maintenance", not "coming soon". Cedi deposits are a thing
          // this product is supposed to do and cannot do today; "coming soon"
          // reads as a feature that was never promised, which is the wrong
          // expectation to set for somebody holding cedis right now.
          reason:
            "Cedi deposits are under maintenance while we finish setup with our Ghana collection partner. We'll let you know the moment they're back.",
        };
  }

  if (currency === "USD") {
    return {
      available: false,
      reason: "Receive dollars using your USD receiving details instead of depositing.",
    };
  }

  return { available: false, reason: `${currency} deposits aren't available yet.` };
}

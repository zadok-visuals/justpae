// Relative, with extensions, for the same reason src/lib/cny/priceCore.ts is:
// availability.test.ts runs under `node --test` with no bundler and therefore
// no "@/" alias resolution. Every module reached from here is import-free
// (flags.ts) or type-only. tsconfig's allowImportingTsExtensions is what lets
// the app's own build read the same specifiers.
import type { Currency } from "../types/database.ts";
import {
  GHS_WALLET_ENABLED,
  NGN_BANK_DEPOSIT_MAINTENANCE,
  KES_BANK_DEPOSIT_MAINTENANCE,
  NGN_MANUAL_DEPOSIT,
  KORAPAY_NGN_DEPOSIT,
} from "../flags.ts";
import type { UnavailableKind } from "../ui/unavailability.ts";

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
 *   NGN, KES, USDT  primary provider, confirmed working — NGN and KES each
 *                   carry their own kill switch (GROUP 7, see flags.ts) so
 *                   ops can take one rail down without the other or without
 *                   touching USDT.
 *   GHS             secondary provider, because the primary rejects GHS
 *                   outright on this account. Behind a flag that ships OFF.
 *   USD             not depositable. Dollars arrive via /receive.
 */

const BUSHA_DEPOSIT_CURRENCIES: Currency[] = ["NGN", "KES", "USDT"];

const BANK_DEPOSIT_MAINTENANCE: Partial<Record<Currency, boolean>> = {
  NGN: NGN_BANK_DEPOSIT_MAINTENANCE,
  KES: KES_BANK_DEPOSIT_MAINTENANCE,
};

const BANK_DEPOSIT_MAINTENANCE_REASON: Partial<Record<Currency, string>> = {
  NGN: "Naira bank deposits are under maintenance. We'll let you know the moment they're back — your naira wallet still converts and withdraws in the meantime.",
  KES: "Shilling bank deposits are under maintenance. We'll let you know the moment they're back — your shilling wallet still converts and withdraws in the meantime.",
};

/**
 * GROUP 4f added `kind`. The REASON was always here; what was missing was a
 * machine-readable form of it, so a 375px-wide `<option>` could carry the
 * right single word instead of the generic "· unavailable" that every one of
 * these three branches collapsed into. See src/lib/ui/unavailability.ts for
 * why the three are not all "Maintenance".
 */
export type DepositAvailability =
  | { available: true; provider: "busha" | "klasha" | "manual" | "korapay" }
  | { available: false; kind: UnavailableKind; reason: string };

export function depositAvailability(currency: Currency): DepositAvailability {
  /**
   * GROUP 2 — the naira account number, FIRST, because when it is on it
   * replaces the manual rail rather than sitting beside it. Two naira
   * deposit paths offered at once is a customer choosing between "send to
   * your own account number" and "send to ours with a reference", which is
   * not a choice anybody can make well.
   *
   * The manual rail below stays exactly where it is and becomes the fallback
   * the moment this flag goes off — which is why this is a branch and not a
   * replacement. The kill switch is deliberately NOT consulted here: it
   * governs the provider's temporary-account rail, which this is not.
   */
  if (currency === "NGN" && KORAPAY_NGN_DEPOSIT) {
    return { available: true, provider: "korapay" };
  }

  /**
   * GROUP 4 — manual naira, BEFORE the provider branch and before the naira
   * kill switch.
   *
   * The kill switch exists to take the PROVIDER rail down. The manual rail is
   * the replacement for that rail being down, so a deposit path gated on the
   * switch being off would be unreachable in exactly the situation it was
   * built for. While NGN_MANUAL_DEPOSIT is on, naira deposits are a bank
   * transfer the customer makes to the company's own account; the switch
   * still governs the provider path it replaces.
   */
  if (currency === "NGN" && NGN_MANUAL_DEPOSIT) {
    return { available: true, provider: "manual" };
  }

  if (BUSHA_DEPOSIT_CURRENCIES.includes(currency)) {
    if (BANK_DEPOSIT_MAINTENANCE[currency]) {
      return {
        available: false,
        kind: "maintenance",
        reason: BANK_DEPOSIT_MAINTENANCE_REASON[currency]!,
      };
    }
    return { available: true, provider: "busha" };
  }

  if (currency === "GHS") {
    return GHS_WALLET_ENABLED
      ? { available: true, provider: "klasha" }
      : {
          available: false,
          // "Under maintenance", not "coming soon". Cedi deposits are a thing
          // this product is supposed to do and cannot do today; "coming soon"
          // reads as a feature that was never promised, which is the wrong
          // expectation to set for somebody holding cedis right now.
          kind: "maintenance",
          reason:
            "Cedi deposits are under maintenance while we finish setup with our Ghana collection partner. We'll let you know the moment they're back.",
        };
  }

  if (currency === "USD") {
    return {
      available: false,
      // NOT maintenance. There is no dollar deposit to repair — dollars
      // arrive because somebody sends them to receiving details, and the one
      // word points at the screen that does that.
      kind: "receive",
      reason: "Receive dollars using your USD receiving details instead of depositing.",
    };
  }

  if (currency === "CNY") {
    return {
      available: false,
      // Also not maintenance, and not "aren't available yet" either — the old
      // fallthrough's wording promised a yuan deposit that is not being built,
      // because yuan has no pay-in rail on this account at all. It is bought.
      kind: "convert",
      reason:
        "Yuan isn't deposited — it's bought by converting from another wallet. Convert naira, shillings or USDT into yuan instead.",
    };
  }

  return {
    available: false,
    kind: "unsupported",
    reason: `${currency} deposits aren't available yet.`,
  };
}

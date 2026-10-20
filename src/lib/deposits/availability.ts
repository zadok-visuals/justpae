// Relative, with extensions, for the same reason src/lib/cny/priceCore.ts is:
// availability.test.ts runs under `node --test` with no bundler and therefore
// no "@/" alias resolution. Every module reached from here is import-free
// (flags.ts) or type-only. tsconfig's allowImportingTsExtensions is what lets
// the app's own build read the same specifiers.
import type { Currency } from "../types/database.ts";
import { GHS_WALLET_ENABLED } from "../flags.ts";
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
 *   NGN, KES, USDT  primary provider, confirmed working
 *   GHS             secondary provider, because the primary rejects GHS
 *                   outright on this account. Behind a flag that ships OFF.
 *   USD             not depositable. Dollars arrive via /receive.
 */

const BUSHA_DEPOSIT_CURRENCIES: Currency[] = ["NGN", "KES", "USDT"];

/**
 * GROUP 4f added `kind`. The REASON was always here; what was missing was a
 * machine-readable form of it, so a 375px-wide `<option>` could carry the
 * right single word instead of the generic "· unavailable" that every one of
 * these three branches collapsed into. See src/lib/ui/unavailability.ts for
 * why the three are not all "Maintenance".
 */
export type DepositAvailability =
  | { available: true; provider: "busha" | "klasha" }
  | { available: false; kind: UnavailableKind; reason: string };

export function depositAvailability(currency: Currency): DepositAvailability {
  if (BUSHA_DEPOSIT_CURRENCIES.includes(currency)) {
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

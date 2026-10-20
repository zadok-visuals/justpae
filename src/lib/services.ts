// Relative, with extensions: this module is covered by services.test.ts,
// which runs under `node --test` with no bundler and therefore no "@/" alias
// resolution. flags.ts is import-free, so this stays safe to reach that way.
// tsconfig's allowImportingTsExtensions is what lets the app's own build
// read the same specifiers.
import {
  USD_WALLET_ENABLED,
  GHS_WALLET_ENABLED,
  USD_COLLECTION_ENABLED,
  BILLS_ENABLED,
  FLIGHTS_ENABLED,
} from "./flags.ts";
// Type-only: erased before this runs, so it costs nothing at the
// module-resolution boundary this file has to keep clean for services.test.ts.
import type { Currency } from "./types/database.ts";

/**
 * GROUP 2a. One place that says whether a given service or currency is
 * live or under maintenance, built on top of the individual flags in
 * src/lib/flags.ts (which stay the thing env vars actually set — this file
 * is the lookup table everything else reads instead of importing five flags
 * by name and re-deriving the same five-way switch itself).
 *
 * A service only becomes "live" by its own env flag being set explicitly.
 * There is no default-on path here — every key below starts "maintenance"
 * and stays that way until its flag is true.
 */
export type ServiceState = "live" | "maintenance";

export type ServiceKey = "usdWallet" | "ghsWallet" | "receiveUsd" | "bills" | "flights";

interface ServiceDef {
  /** What a "Notify me" / toast refers to it as. */
  label: string;
  state: ServiceState;
}

export const SERVICES: Record<ServiceKey, ServiceDef> = {
  usdWallet: { label: "USD wallet", state: USD_WALLET_ENABLED ? "live" : "maintenance" },
  ghsWallet: { label: "GHS wallet", state: GHS_WALLET_ENABLED ? "live" : "maintenance" },
  receiveUsd: { label: "Receive USD", state: USD_COLLECTION_ENABLED ? "live" : "maintenance" },
  bills: { label: "Bills", state: BILLS_ENABLED ? "live" : "maintenance" },
  flights: { label: "Flights", state: FLIGHTS_ENABLED ? "live" : "maintenance" },
};

export function isServiceLive(key: ServiceKey): boolean {
  return SERVICES[key].state === "live";
}

export function serviceLabel(key: ServiceKey): string {
  return SERVICES[key].label;
}

/**
 * GROUP 2b. The two wallet currencies a service flag locks, in the one place
 * both the wallet cards and the accounts list read from instead of each
 * keeping its own copy of "which currency maps to which flag".
 *
 */
export function isWalletLocked(currency: Currency): boolean {
  if (currency === "USD") return !isServiceLive("usdWallet");
  if (currency === "GHS") return !isServiceLive("ghsWallet");
  return false;
}

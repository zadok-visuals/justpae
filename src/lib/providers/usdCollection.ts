import type { UsdCollectionAccount } from "@/lib/types/database";
import { USD_COLLECTION_ENABLED } from "@/lib/flags";

/**
 * FEATURE 1 — USD receiving details.
 *
 * The provider that will issue USD collection on this account is NOT yet
 * confirmed, so this file defines the interface a provider has to satisfy and
 * nothing else. No endpoint, no request shape, no header scheme is invented.
 *
 * That is a deliberate choice rather than an omission. A guessed API here
 * produces code that looks finished, cannot be reviewed against anything real,
 * and fails the first time a real credential is plugged in — by which point
 * the guess has been built on top of. The honest version is an interface, a
 * flag that ships off, and a /receive page that says so.
 *
 * Wiring a real provider up means exactly three things:
 *   1. Implement UsdCollectionProvider in a new file next to this one.
 *   2. Return it from resolveProvider() below.
 *   3. Set NEXT_PUBLIC_FEATURE_USD_COLLECTION=true and the provider's own
 *      server-side credentials.
 *
 * Nothing else in the app needs to change: /receive, the webhook route and the
 * usd_collection_accounts table are all already built against this interface.
 */

export interface UsdReceivingDetails {
  /** Shown as the headline "pay to" name. */
  accountName: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  bankName: string | null;
  bankAddress: string | null;
  /** e.g. "Checking" — some rails require the sender to pick one. */
  accountType: string | null;
  /**
   * OURS, not the provider's: the code a sender must quote so an incoming
   * payment can be attributed to this user. It is the one field that always
   * exists, whatever shape the provider's details turn out to take.
   */
  referenceCode: string;
  status: "pending" | "active" | "disabled";
}

export interface UsdCollectionProvider {
  /** Stable identifier recorded on the row, for auditing which issued what. */
  readonly name: string;

  /**
   * Issues (or re-fetches) receiving details for a user. Implementations must
   * be idempotent per user: called again, it returns the existing details
   * rather than issuing a second set, because two live sets of receiving
   * instructions for one person is a reconciliation problem waiting to happen.
   */
  issueAccount(params: {
    userId: string;
    fullName: string | null;
    email: string;
  }): Promise<UsdReceivingDetails>;

  /**
   * Verifies an incoming webhook and returns what it reports. Returning null
   * means "not verified" and the caller MUST discard the payload — a USD
   * balance is credited only from a verified webhook, never from an
   * unauthenticated POST that merely claims money arrived.
   */
  verifyWebhook(params: {
    rawBody: string;
    headers: Headers;
  }): Promise<
    | {
        referenceCode: string;
        amount: number;
        currency: "USD";
        providerReference: string;
        event: "credited" | "failed";
      }
    | null
  >;
}

/**
 * Returns the configured provider, or null when none is wired up.
 *
 * The flag being on is NOT sufficient — a flag flipped without an
 * implementation must still return null rather than crash a page render, so
 * /receive degrades to its coming-soon state either way.
 */
export function resolveProvider(): UsdCollectionProvider | null {
  if (!USD_COLLECTION_ENABLED) return null;
  // No implementation exists yet. See the header for what adding one takes.
  return null;
}

export function isUsdCollectionAvailable(): boolean {
  return resolveProvider() != null;
}

/** Maps a stored row to the shape /receive renders. */
export function toReceivingDetails(row: UsdCollectionAccount): UsdReceivingDetails {
  return {
    accountName: row.account_name,
    accountNumber: row.account_number,
    routingNumber: row.routing_number,
    bankName: row.bank_name,
    bankAddress: row.bank_address,
    accountType: row.account_type,
    referenceCode: row.reference_code,
    status: row.status,
  };
}

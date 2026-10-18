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
 *
 * ── A CANDIDATE, FOUND IN THE PROVIDER'S OWN DOCS (Group 6e research) ──────
 *
 * Our existing provider documents persistent per-end-user accounts, which is
 * exactly the shape this interface wants. Recorded here rather than built,
 * because every line below is read off public documentation and none of it
 * has been exercised against this account's credentials:
 *
 *   POST /v1/customers                      creates an end user. Individual
 *                                           needs email, type, country_id,
 *                                           phone, birth_date, first/last
 *                                           name, a full address object and
 *                                           has_accepted_terms.
 *   PUT  /v1/customers/{id}                 can add a BVN afterwards.
 *   GET  /v1/virtual_bank_accounts/{code}   the dedicated account for one
 *                                           currency. Takes an
 *                                           X-BU-PROFILE-ID header and
 *                                           returns account_name,
 *                                           account_number, bank_name,
 *                                           bank_code, status — a persistent
 *                                           row with its own created_at, not
 *                                           a per-transfer allocation.
 *
 * Two things make this a real lead rather than a hope. The response carries a
 * `meta` naming ACH and WIRE as payment methods, which is a USD rail and not
 * an NGN one — so the endpoint is plausibly the answer to BOTH the dollar
 * receiving details this file exists for AND a standing naira account number.
 * And the account is keyed to a customer profile, which is what makes an
 * incoming payment attributable without the reference code above.
 *
 * What is NOT known, and must be confirmed before any of it is built:
 *   - whether this account's API key has the virtual_bank_accounts:read scope
 *     at all, and whether the Customers API is enabled on it;
 *   - what X-BU-PROFILE-ID is in terms of our own data, and how it relates to
 *     a customer id;
 *   - whether USD is actually an accepted `code`, or only NGN. The docs show
 *     the parameter as a free currency string and list no supported set.
 *   - NGN virtual accounts require the customer's BVN on file, and requests
 *     without one fail `err_bvn_verification_required`. Collecting a BVN is a
 *     KYC change with its own consequences — it is not a field to add to the
 *     onboarding form on the strength of a docs page.
 *
 * Deliberately not built in this run. The next step is a read-only probe of
 * GET /v1/customers with the live key to establish whether the API is even
 * enabled, which costs nothing and moves no money.
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

import type { BillCategory } from "@/lib/types/database";
import { BILLS_ENABLED } from "@/lib/flags";

/**
 * FEATURE 5 — bills and airtime.
 *
 * The provider is not chosen yet, so this file is the interface every realistic
 * candidate fits behind, plus a static catalogue of the real billers and
 * networks in each country so the whole flow can be built, reviewed and used
 * against real names rather than placeholders.
 *
 * Realistic candidates, all of which expose the same shape (list billers,
 * validate a customer identifier, pay, then return a token for prepaid
 * electricity):
 *
 *   Nigeria + Ghana + Kenya, one integration
 *     - Flutterwave Bills      NG, GH, KE, UG, TZ, ZM. Airtime, data,
 *                              electricity, cable, water.
 *     - Reloadly               Airtime and data across all three plus most of
 *                              Africa; utilities only in some markets.
 *
 *   Nigeria-strong, broad category coverage
 *     - Paystack               NG only for bills in practice.
 *     - VTpass                 NG. Deep biller coverage (every DisCo, all
 *                              cable providers, water boards).
 *     - Baxi / Interswitch Quickteller  NG, very wide biller list.
 *
 *   Ghana
 *     - Hubtel                 GH. ECG prepaid, Ghana Water, DStv, all four
 *                              networks.
 *     - Paystack Ghana / Flutterwave GH for airtime and data.
 *
 *   Kenya
 *     - Safaricom Daraja (M-Pesa Paybill) KPLC tokens, Nairobi Water, DStv,
 *                              and Safaricom airtime, via paybill numbers.
 *     - Kyanda / Tanda         KE aggregators covering KPLC, water, cable and
 *                              all three networks behind one API.
 *
 * The practical recommendation, and the reason the interface looks like this:
 * one aggregator covering all three countries (Flutterwave Bills or Reloadly)
 * to launch, since a three-provider integration means three auth schemes,
 * three biller taxonomies and three reconciliation models before a single bill
 * is paid. A per-country specialist is worth adding later for depth in a
 * market that is actually producing volume.
 *
 * Until one is chosen the flag ships OFF and /bills shows a clear coming-soon
 * state. Schema, server actions and the whole UI are complete.
 */

export interface Biller {
  /** Provider-facing code. Stored on the payment row for reconciliation. */
  code: string;
  name: string;
  category: BillCategory;
  country: string;
  /** What the customer identifier is called in this biller's own terms. */
  identifierLabel: string;
  /** Hint under the field — a meter number looks nothing like a smartcard. */
  identifierHint?: string;
  /** Whether the biller supports looking a customer's name up before paying. */
  supportsNameValidation: boolean;
  /** Fixed denominations, where the biller only sells set amounts. */
  fixedAmounts?: number[];
  minAmount?: number;
  maxAmount?: number;
}

export interface BillerValidation {
  customerName: string | null;
  /** Some billers return an outstanding balance or minimum vend amount. */
  outstandingAmount?: number | null;
  /** Set when validation definitively failed, e.g. an unknown meter. */
  error?: string;
}

export interface BillPaymentResult {
  providerReference: string;
  /** Prepaid electricity token. The single most important field on a receipt. */
  token: string | null;
  units: string | null;
  /** True when the provider settles asynchronously and a webhook will follow. */
  pending: boolean;
}

export interface BillsProvider {
  readonly name: string;

  /** Billers for a category in a country. */
  listBillers(params: { country: string; category: BillCategory }): Promise<Biller[]>;

  /**
   * Looks a customer up before payment, where the biller supports it. A
   * mistyped meter number is the most common failure in this whole flow and
   * the only chance to catch it is before the money moves.
   */
  validateCustomer(params: {
    biller: Biller;
    customerIdentifier: string;
  }): Promise<BillerValidation>;

  /**
   * Pays. Implementations MUST be idempotent on `reference` — this is called
   * after the user's wallet has already been debited, so a retry that pays
   * twice is a double charge with no way back.
   */
  pay(params: {
    biller: Biller;
    customerIdentifier: string;
    amount: number;
    currency: string;
    /** Our bill_payments row id, passed as the provider idempotency key. */
    reference: string;
  }): Promise<BillPaymentResult>;
}

export function resolveProvider(): BillsProvider | null {
  if (!BILLS_ENABLED) return null;
  // No implementation exists yet. Add one next to this file, return it here,
  // and set NEXT_PUBLIC_FEATURE_BILLS=true plus its server-side credentials.
  return null;
}

export function isBillsAvailable(): boolean {
  return resolveProvider() != null;
}

/**
 * The real networks and billers per country, used to build and review the flow
 * before a provider is wired up.
 *
 * `code` values here are the biller's own commonly-used identifiers, NOT a
 * particular aggregator's internal codes — every aggregator uses its own. When
 * a provider is chosen, its listBillers() implementation replaces this
 * catalogue wholesale; nothing stores these codes permanently except as a
 * record of what was paid.
 */
export const BILLER_CATALOGUE: Biller[] = [
  // ── Nigeria ──────────────────────────────────────────────────────────────
  ...mobileNetworks("NG", ["MTN", "Airtel", "Glo", "9mobile"]),
  ...electricity("NG", [
    ["IKEDC", "Ikeja Electric"],
    ["EKEDC", "Eko Electricity"],
    ["AEDC", "Abuja Electricity"],
    ["PHED", "Port Harcourt Electricity"],
    ["IBEDC", "Ibadan Electricity"],
    ["KEDCO", "Kano Electricity"],
    ["EEDC", "Enugu Electricity"],
    ["BEDC", "Benin Electricity"],
    ["JED", "Jos Electricity"],
    ["KAEDCO", "Kaduna Electric"],
  ]),
  ...cableTv("NG", [
    ["DSTV", "DStv"],
    ["GOTV", "GOtv"],
    ["STARTIMES", "StarTimes"],
    ["SHOWMAX", "Showmax"],
  ]),
  ...water("NG", [
    ["LWC", "Lagos Water Corporation"],
    ["FCTWB", "FCT Water Board"],
  ]),

  // ── Ghana ────────────────────────────────────────────────────────────────
  ...mobileNetworks("GH", ["MTN Ghana", "Telecel Ghana", "AirtelTigo"]),
  ...electricity("GH", [
    ["ECG", "Electricity Company of Ghana"],
    ["NEDCO", "Northern Electricity Distribution"],
  ]),
  ...cableTv("GH", [
    ["DSTV_GH", "DStv Ghana"],
    ["GOTV_GH", "GOtv Ghana"],
  ]),
  ...water("GH", [["GWCL", "Ghana Water Company"]]),

  // ── Kenya ────────────────────────────────────────────────────────────────
  ...mobileNetworks("KE", ["Safaricom", "Airtel Kenya", "Telkom Kenya"]),
  ...electricity("KE", [["KPLC", "Kenya Power (KPLC)"]]),
  ...cableTv("KE", [
    ["DSTV_KE", "DStv Kenya"],
    ["GOTV_KE", "GOtv Kenya"],
    ["ZUKU", "Zuku"],
  ]),
  ...water("KE", [
    ["NCWSC", "Nairobi City Water"],
    ["MOWASSCO", "Mombasa Water"],
  ]),
];

/**
 * Airtime and data share a network list — the same four Nigerian networks sell
 * both — so they are generated together rather than listed twice.
 */
function mobileNetworks(country: string, names: string[]): Biller[] {
  return names.flatMap((name) => {
    const code = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const base = {
      country,
      identifierLabel: "Phone number",
      identifierHint: "The number you're topping up",
      // Networks don't expose a name lookup for a phone number, and the number
      // itself is the only confirmation available.
      supportsNameValidation: false,
    };
    return [
      {
        ...base,
        code: `${code}_AIRTIME`,
        name,
        category: "airtime" as BillCategory,
        minAmount: 50,
      },
      {
        ...base,
        code: `${code}_DATA`,
        name,
        category: "data" as BillCategory,
      },
    ];
  });
}

function electricity(country: string, entries: [string, string][]): Biller[] {
  return entries.map(([code, name]) => ({
    code,
    name,
    category: "electricity" as BillCategory,
    country,
    identifierLabel: "Meter number",
    identifierHint: "Prepaid meter number, digits only",
    // Electricity is the one category where a name lookup is both supported
    // and essential: a mistyped meter number credits a stranger's meter and
    // there is no recall.
    supportsNameValidation: true,
  }));
}

function cableTv(country: string, entries: [string, string][]): Biller[] {
  return entries.map(([code, name]) => ({
    code,
    name,
    category: "cable_tv" as BillCategory,
    country,
    identifierLabel: "Smartcard number",
    identifierHint: "On the back of your decoder",
    supportsNameValidation: true,
  }));
}

function water(country: string, entries: [string, string][]): Biller[] {
  return entries.map(([code, name]) => ({
    code,
    name,
    category: "water" as BillCategory,
    country,
    identifierLabel: "Account number",
    supportsNameValidation: true,
  }));
}

export function billersFor(country: string, category: BillCategory): Biller[] {
  return BILLER_CATALOGUE.filter((b) => b.country === country && b.category === category);
}

export function findBiller(code: string): Biller | null {
  return BILLER_CATALOGUE.find((b) => b.code === code) ?? null;
}

export const BILL_CATEGORIES: { value: BillCategory; label: string; blurb: string }[] = [
  { value: "airtime", label: "Airtime", blurb: "Top up any number" },
  { value: "data", label: "Data", blurb: "Bundles on every network" },
  { value: "electricity", label: "Electricity", blurb: "Prepaid tokens and postpaid" },
  { value: "water", label: "Water", blurb: "Settle your water bill" },
  { value: "cable_tv", label: "Cable TV", blurb: "DStv, GOtv and more" },
];

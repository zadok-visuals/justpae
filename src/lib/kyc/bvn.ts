/**
 * The Nigerian BVN, and the rules for handling it.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY IT IS SUDDENLY REQUIRED
 *
 * A permanent naira account number can only be issued against a BVN — the
 * provider will not create one from a NIN. Before this, Nigerian onboarding
 * asked for "BVN or NIN" and stored whichever arrived under a single document
 * type, which was fine while a human reviewer was the only consumer and is not
 * fine now that a machine has to use the number.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * IT IS TREATED AS A SECRET, NOT AS A FORM FIELD
 *
 * A BVN identifies a person across every bank in Nigeria. It is not a password
 * — knowing one does not move money — but it is the single most useful string
 * an attacker can hold for social engineering a Nigerian bank customer, and it
 * cannot be rotated. So:
 *
 *   - it is NEVER logged, not in an error path, not in a provider-request log,
 *     not in admin activity detail;
 *   - it is NEVER rendered in full after it is saved, to the customer OR to an
 *     admin — maskBvn is the only way it reaches a screen. An admin reviewing
 *     identity has the uploaded document photo, which is the artefact a human
 *     check is actually performed against; the number itself exists here to be
 *     handed to the account issuer, not to be read;
 *   - it is NEVER put in a URL, a query string or a redirect.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE LEGACY ROW, and why an existing Nigerian user is still asked
 *
 * Accounts verified before this change carry one row of document_type
 * `nigeria_bvn_or_nin` holding an 11-digit number that is EITHER a BVN or a
 * NIN, with nothing recorded to say which. There is no way to tell them apart
 * — both are 11 digits — and handing a NIN to the account issuer fails with an
 * error that does not say "that was a NIN".
 *
 * So a legacy row does not count as a BVN. Those users are asked once, on the
 * screen that needs it, and the answer is stored under the unambiguous type.
 * The legacy row is left exactly where it is: it is evidence a human reviewer
 * already acted on, and rewriting history to make a migration tidier is not
 * worth it.
 */

export const BVN_DOCUMENT_TYPE = "nigeria_bvn";
export const NIN_DOCUMENT_TYPE = "nigeria_nin";
/** Pre-split Nigerian identity rows. Ambiguous by construction — see above. */
export const LEGACY_NG_ID_DOCUMENT_TYPE = "nigeria_bvn_or_nin";

/** Both are fixed-length 11-digit numbers. */
const ELEVEN_DIGITS = /^\d{11}$/;

export function isValidBvn(value: string): boolean {
  return ELEVEN_DIGITS.test(value.trim());
}

export function isValidNin(value: string): boolean {
  return ELEVEN_DIGITS.test(value.trim());
}

/**
 * The only form in which a saved BVN reaches a screen: the last four digits,
 * enough for the owner to recognise their own number and useless to anyone
 * else.
 *
 * Returns the mask for a short or malformed value too rather than echoing it
 * back — a value that failed validation is still somebody's identity number,
 * and "it was the wrong length" is not a reason to print it.
 */
export function maskBvn(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "•••• ••••";
  return `••••••• ${digits.slice(-4)}`;
}

/** True for the document types that must never be rendered in full. */
export function isMaskedDocumentType(documentType: string): boolean {
  return (
    documentType === BVN_DOCUMENT_TYPE ||
    documentType === NIN_DOCUMENT_TYPE ||
    documentType === LEGACY_NG_ID_DOCUMENT_TYPE
  );
}

/**
 * What a screen should show for one stored KYC value. Masks the identity
 * numbers and passes everything else through — a Ghana Card number and a
 * government ID type are read by a reviewer and are not secrets in this sense.
 */
export function displayKycValue(documentType: string, value: string | null): string {
  if (value == null || value === "") return "—";
  return isMaskedDocumentType(documentType) ? maskBvn(value) : value;
}

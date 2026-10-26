/**
 * Strips control and bidi-override characters from text a user supplied
 * (a recipient name, an account number, a payout reference) before it is
 * drawn into the receipt PNG, and caps its length. Satori renders these as
 * literal SVG text nodes, so an embedded control character or an unbounded
 * string is a rendering attack surface, not just a cosmetic risk.
 */
export function sanitizeReceiptText(value: string, max = 120): string {
  const stripped = value.replace(/[\p{Cc}\p{Cf}]/gu, "");
  return stripped.length > max ? stripped.slice(0, max) : stripped;
}

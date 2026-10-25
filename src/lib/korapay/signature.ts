import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Korapay's webhook signature.
 *
 * Its own module, with no imports but node:crypto, so it can be exercised
 * under `node --test` without a bundler — the check that decides whether a
 * request may credit a wallet is the last one that should be untestable.
 *
 * THE SCHEME, which is published rather than reverse-engineered: a hex
 * HMAC-SHA256 over `JSON.stringify(payload.data)` — the DATA object, not the
 * raw body and not the whole payload — keyed with the secret key, carried in
 * `x-korapay-signature`.
 *
 * Signing a re-serialisation rather than the bytes received is unusual and
 * has a real consequence: a sender whose key ordering differs from ours
 * produces a signature we cannot reproduce. Korapay's own sender does not,
 * and the reconcile cron is the backstop if that ever changes — but it is
 * why a mismatch here is worth looking at rather than assuming hostile.
 */
export function korapaySignature(data: unknown, secret: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(data)).digest("hex");
}

/**
 * Constant-time comparison, with the length checked first because
 * timingSafeEqual THROWS on a length mismatch — and a throw in a webhook
 * receiver is a 500, which the provider reads as "retry". One malformed
 * header would become a flood.
 *
 * Returns false for a missing secret as well as a missing header: a receiver
 * that cannot verify must not accept. That is the opposite of the Busha
 * receiver's "no secret means the check is disabled", and deliberately so —
 * see that file for the history that made its default the right one there.
 */
export function verifyKorapaySignature(
  data: unknown,
  signatureHeader: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !signatureHeader) return false;

  const expected = Buffer.from(korapaySignature(data, secret), "utf8");
  const actual = Buffer.from(signatureHeader, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

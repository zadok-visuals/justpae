import { createHmac } from "node:crypto";

/**
 * RFC 6238 TOTP from a base32 secret, hand-rolled rather than a dependency:
 * the only place this project needs an OTP code is generating one for the
 * admin fixture's own enrolment, once, in the e2e harness.
 */
function base32Decode(input: string): Buffer {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");

  let bits = "";
  for (const char of clean) {
    const value = ALPHABET.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** The 6-digit code for right now (or for `atMs`, in tests). RFC 6238 defaults: 30s step, SHA-1. */
export function totpCode(secretBase32: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const key = base32Decode(secretBase32);
  const hmac = createHmac("sha1", key).update(counterBuffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 1_000_000).toString().padStart(6, "0");
}

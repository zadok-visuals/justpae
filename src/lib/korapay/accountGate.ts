/**
 * Who gets a naira account number, in the order the questions are asked.
 *
 * Import-free so it runs under `node --test` with no bundler, and pure so
 * the gate order is asserted rather than assumed. The order is the design:
 * each answer is a state the screen can render, so a customer three taps
 * from depositing is told which tap rather than shown a failure.
 *
 * AN ISSUED ACCOUNT WINS OVER EVERY LATER GATE. A customer whose KYC went
 * back to pending may already have the number saved in their bank app and
 * may already have money sitting in it; hiding it would hide a destination
 * that still works. The gates decide who gets a NEW one.
 */

export type AccountGate =
  | { state: "ready" }
  | { state: "needs_kyc" }
  | { state: "needs_bvn" }
  | { state: "wrong_country" }
  /** Every gate passed and no account exists yet — issue one. */
  | { state: "none" };

export function virtualAccountGate(input: {
  hasAccount: boolean;
  kycStatus: string | null | undefined;
  country: string | null | undefined;
  hasBvn: boolean;
}): AccountGate {
  if (input.hasAccount) return { state: "ready" };
  if (input.kycStatus !== "approved") return { state: "needs_kyc" };
  if (input.country !== "NG") return { state: "wrong_country" };
  if (!input.hasBvn) return { state: "needs_bvn" };
  return { state: "none" };
}

import { createAdminClient } from "@/lib/supabase/admin";
import { createVirtualBankAccount, KorapayError } from "@/lib/korapay/client";
import { readBvnForProviderCall, bvnOnFile } from "@/lib/kyc/bvnRecord";
import { classifyProviderFailure, customerMessageFor } from "@/lib/providers/failure";
import { virtualAccountGate } from "@/lib/korapay/accountGate";
import type { VirtualAccount } from "@/lib/types/database";

/**
 * Getting a Nigerian customer their permanent naira account number.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE ORDER OF THE GATES IS THE WHOLE DESIGN
 *
 * KYC, then BVN, then the provider call — and each one returns a state the
 * screen can render rather than throwing. A customer who is three taps from
 * being able to deposit should be told which tap, not shown a failure.
 *
 *   not approved   → "Verify your identity to get your account number"
 *   no BVN on file → the one-question form (see BvnPrompt)
 *   already issued → the stored row, with no provider call at all
 *   otherwise      → issue one, store it, show it
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT IS NEVER TRUSTED FROM THE BROWSER
 *
 * The user id arrives from supabase.auth.getUser() at the call site. Every
 * other input — the name on the account, the email, the BVN, the bank code —
 * is read server-side from the profile, the KYC rows or the environment. A
 * virtual account created from browser-supplied details would be an account
 * number pointing at a name the customer chose.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE BVN NEVER TOUCHES A LOG
 *
 * It is read, passed to the issuer, and dropped. The failure path logs the
 * provider's status and body — which is the thing worth having — and the
 * request body is NOT logged, because the request body is where the BVN is.
 */

export type VirtualAccountState =
  | { state: "ready"; account: VirtualAccount }
  | { state: "needs_kyc"; kycStatus: string }
  | { state: "needs_bvn" }
  /** Everything checks out and no account has been issued yet. Only ever
   *  returned by the READ-ONLY lookup; getNgnVirtualAccount issues one. */
  | { state: "none" }
  | { state: "unavailable"; message: string };

const NGN_PROVIDER = "korapay" as const;

/** The account_reference we hand the provider. Stable per user, so looking an
 *  account up again never depends on a value we might have lost. */
export function accountReferenceFor(userId: string): string {
  return `jp_${userId}`;
}

/**
 * The name on the account. "justpae <full name>" so a customer looking at
 * their bank app sees both who it is with and that it is theirs.
 *
 * Trimmed and collapsed because a profile name is free text and the issuer
 * rejects awkward whitespace; truncated because the field has a length limit
 * at the bank and a rejected creation is worse than a shortened name.
 */
export function virtualAccountNameFor(fullName: string | null | undefined): string {
  const cleaned = (fullName ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "justpae";
  return `justpae ${cleaned}`.slice(0, 60);
}

/**
 * THE READ-ONLY HALF. Walks the same gates and stops at "none" instead of
 * calling the provider.
 *
 * It exists because /deposit renders for every currency, and issuing a naira
 * account number to somebody who opened the screen to deposit USDT is a real
 * provider-side object created for nothing — which matters more than usual
 * while the sandbox caps the account count. The page calls this; it calls
 * getNgnVirtualAccount only when naira is the currency actually being
 * deposited into, and the button in the UI covers the case where a customer
 * switches to naira after the page has rendered.
 */
export async function loadNgnVirtualAccount(userId: string): Promise<VirtualAccountState> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("virtual_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("currency", "NGN")
    .eq("provider", NGN_PROVIDER)
    .maybeSingle();

  const { data: profile } = await admin
    .from("profiles")
    .select("kyc_status, country")
    .eq("id", userId)
    .maybeSingle();

  // The BVN read is skipped when an earlier gate already decides the answer.
  const needsBvnCheck = Boolean(existing) === false && profile?.kyc_status === "approved";
  const hasBvn = needsBvnCheck ? (await bvnOnFile(userId)).present : false;

  // The ORDER lives in accountGate.ts, pure and tested. This function is the
  // reads around it.
  const gate = virtualAccountGate({
    hasAccount: Boolean(existing),
    kycStatus: profile?.kyc_status,
    country: profile?.country,
    hasBvn,
  });

  switch (gate.state) {
    case "ready":
      return { state: "ready", account: existing as VirtualAccount };
    case "needs_kyc":
      return { state: "needs_kyc", kycStatus: profile?.kyc_status ?? "not_started" };
    case "wrong_country":
      return {
        state: "unavailable",
        message: "Account numbers for naira are only issued to Nigerian accounts.",
      };
    case "needs_bvn":
      return { state: "needs_bvn" };
    default:
      return { state: "none" };
  }
}

/** The read-only lookup, then the provider call if nothing was found. */
export async function getNgnVirtualAccount(userId: string): Promise<VirtualAccountState> {
  const found = await loadNgnVirtualAccount(userId);
  if (found.state !== "none") return found;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  return createNgnVirtualAccount(userId, {
    fullName: profile?.full_name ?? null,
    email: profile?.email ?? null,
  });
}

/**
 * The provider call, split out so the server action that saves a BVN can go
 * straight on to issue the account without re-walking the gates.
 */
export async function createNgnVirtualAccount(
  userId: string,
  profile: { fullName: string | null; email: string | null },
): Promise<VirtualAccountState> {
  const bankCode = process.env.KORAPAY_VBA_BANK_CODE;
  if (!bankCode) {
    console.error("[korapay.virtualAccount] KORAPAY_VBA_BANK_CODE is not set");
    return {
      state: "unavailable",
      message: "Naira account numbers are being set up. Try again shortly.",
    };
  }

  const bvn = await readBvnForProviderCall(userId);
  if (!bvn) return { state: "needs_bvn" };

  const email = profile.email;
  if (!email) {
    return {
      state: "unavailable",
      message: "We need an email address on your account first. Contact support.",
    };
  }

  let issued;
  try {
    issued = await createVirtualBankAccount({
      accountName: virtualAccountNameFor(profile.fullName),
      accountReference: accountReferenceFor(userId),
      bankCode,
      customerName: (profile.fullName ?? "").trim() || "justpae customer",
      customerEmail: email,
      bvn,
    });
  } catch (err) {
    const status = err instanceof KorapayError ? err.status : undefined;
    const body = err instanceof KorapayError ? err.body : undefined;
    // The provider's verbatim body, which is what any investigation starts
    // from. NOT the request body — that is where the BVN is.
    console.error("[korapay.virtualAccount] could not create an account", {
      userId,
      status: status ?? null,
      body: body ?? null,
      message: err instanceof Error ? err.message : String(err),
    });

    const failure = classifyProviderFailure(
      status,
      err instanceof Error ? err.message : undefined,
    );
    return {
      state: "unavailable",
      // Our copy, never the provider's, and the provider is never named —
      // the same rule every other rail follows. Specific where it can be:
      // "rejected" tells them the details did not check out, which is
      // actionable, and an outage tells them to come back.
      message:
        failure === "rejected"
          ? "We couldn't set up your account number — the details didn't check out. Make sure your BVN matches the name on your ID, or contact support."
          : customerMessageFor(failure, { currency: "NGN", action: "deposit" }),
    };
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin.rpc("record_virtual_account", {
    p_user_id: userId,
    p_currency: "NGN",
    p_provider: NGN_PROVIDER,
    p_account_number: issued.account_number,
    p_bank_name: issued.bank_name,
    p_account_name: issued.account_name,
    p_provider_reference: issued.account_reference,
  });

  if (error || !row) {
    // The account EXISTS at the provider and we failed to record it. Money
    // sent to it would arrive with nothing here to match it to a user, so
    // this is logged as the real problem it is rather than as a UI hiccup —
    // the reconcile cron cannot help with an account it has never heard of.
    console.error("[korapay.virtualAccount] issued but not recorded", {
      userId,
      accountReference: issued.account_reference,
      error,
    });
    return {
      state: "unavailable",
      message: "We couldn't finish setting up your account number. Please try again.",
    };
  }

  return { state: "ready", account: row as VirtualAccount };
}

"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdminUser, logAdminActivity } from "@/lib/auth/admin";
import { RATES_CACHE_TAG } from "@/lib/rates/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import { SETTING_KEYS } from "@/lib/settings";
import { isCurrency } from "@/lib/currencies";
import { sendEmail, sendKycApprovedEmail, sendKycRejectedEmail } from "@/lib/email";
import { notifyWithdrawalCompleted, notifyWithdrawalFailed } from "@/lib/notify/events";
import { toRpcError } from "@/lib/provider-error";
import { KYC_BUCKET } from "@/lib/kyc/constants";

/**
 * Admin actions.
 *
 * EVERY function here starts with requireAdminUser(). That is not belt-and-
 * braces on top of a gated page — a server action is reachable by POST whether
 * or not the page rendering its form was gated, so this is the only gate that
 * actually exists. Omitting it on one action makes that action public.
 */

export interface AdminActionState {
  error?: string;
  ok?: boolean;
  /**
   * Echoed back on failure so the React 19 form reset does not blank a typed
   * rejection reason. A reason is required and the customer reads it, so it
   * is usually a sentence someone composed rather than a word — losing it to
   * a transient RPC error means writing it again.
   *
   * The rates forms carry theirs too. There the reset is worse than blanking:
   * those fields default to the STORED value, so a rejected edit silently
   * snaps back to the old number and looks like it saved.
   *
   * settingKey scopes settingValue, because /admin/rates renders one form per
   * setting over a single shared action state — without it, a rejected edit
   * to one setting would repopulate all three.
   */
  values?: {
    reason?: string;
    pair?: string;
    markupPercent?: string;
    settingKey?: string;
    settingValue?: string;
  };
}

export async function approveKyc(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const actor = await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_approve_kyc", { p_user_id: userId });

  if (error) return { error: toRpcError(error, "admin") };

  // The decision is already made and committed by this point, so none of the
  // three steps below is allowed to fail it — a user whose KYC was approved
  // must not be told the approval failed because an email provider was down,
  // and an unwritten ledger line is not a reason to un-approve someone.
  await logAdminActivity({
    adminId: actor.id,
    action: "kyc.approve",
    targetType: "user",
    targetId: userId,
  });

  await notifyUser(admin, userId, {
    title: "You're verified",
    body: "Your identity check is approved. Withdrawals are now open.",
    href: "/withdraw",
    actedBy: actor.id,
    email: (to) => sendKycApprovedEmail({ to }),
  });

  revalidatePath("/admin/kyc");
  return { ok: true };
}

export async function rejectKyc(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const actor = await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  // Required, not optional. Without it the user's status page can only say
  // "please review and resubmit", which tells them nothing and all but
  // guarantees a second rejection for the same reason.
  if (!reason) return { error: "A rejection reason is required.", values: { reason } };

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_reject_kyc", {
    p_user_id: userId,
    p_reason: reason,
  });

  if (error) return { error: toRpcError(error, "admin"), values: { reason } };

  await logAdminActivity({
    adminId: actor.id,
    action: "kyc.reject",
    targetType: "user",
    targetId: userId,
    detail: { reason },
  });

  await notifyUser(admin, userId, {
    title: "We need another look at your documents",
    body: reason,
    href: "/onboarding/kyc/status",
    actedBy: actor.id,
    email: (to) => sendKycRejectedEmail({ to, reason }),
  });

  revalidatePath("/admin/kyc");
  return { ok: true };
}

/**
 * Shared "tell the user" step for an admin decision that has already been
 * committed.
 *
 * NEVER THROWS, and never changes the caller's result. Both channels are
 * best-effort by design: the authoritative action is the RPC that already
 * succeeded, and a failed notification insert or a dead email provider must not
 * turn a completed approval into a reported failure. Failures are logged so a
 * persistently broken channel is visible rather than silent.
 */
async function notifyUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  params: {
    title: string;
    body: string;
    href?: string;
    /** The acting admin, recorded on the notification row. */
    actedBy: string;
    email?: (to: string) => Promise<boolean>;
  },
): Promise<void> {
  try {
    const { error } = await admin.rpc("admin_send_notification", {
      p_user_id: userId,
      p_title: params.title,
      p_body: params.body,
      p_href: params.href ?? null,
      p_created_by: params.actedBy,
    });
    if (error) {
      console.error("[admin.notifyUser] notification insert failed", { userId, error });
    }

    if (params.email) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.email) await params.email(profile.email);
    }
  } catch (err) {
    console.error("[admin.notifyUser] threw", {
      userId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

export async function completeWithdrawal(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const actor = await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_complete_withdrawal", {
    p_transaction_id: transactionId,
  });

  if (error) return { error: toRpcError(error, "admin") };

  // The customer was told nothing at all when an admin paid out by hand, which
  // is the one path where they are LEAST likely to already know: an automated
  // payout settles in seconds while they are still on the screen, whereas a
  // manual one happens hours later with nobody watching.
  await notifyWithdrawalCompleted(transactionId);

  // Releasing money by hand is the single most sensitive thing an admin does
  // here, so it is the entry the ledger most needs.
  await logAdminActivity({
    adminId: actor.id,
    action: "withdrawal.complete",
    targetType: "transaction",
    targetId: transactionId,
  });

  revalidatePath("/admin/withdrawals");
  return { ok: true };
}

export async function rejectWithdrawal(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const actor = await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  const admin = createAdminClient();
  // This refunds the wallet. An admin rejection must not strand a debited
  // withdrawal any more than a provider failure may.
  const { error } = await admin.rpc("admin_reject_withdrawal", {
    p_transaction_id: transactionId,
    p_reason: reason || null,
  });

  if (error) return { error: toRpcError(error, "admin"), values: { reason } };

  // admin_reject_withdrawal has already refunded the wallet, and the refund is
  // the headline of the message. A rejected withdrawal the customer is never
  // told about looks, from their side, exactly like money that vanished for
  // several hours and then reappeared with no explanation.
  await notifyWithdrawalFailed(transactionId, reason || null);

  await logAdminActivity({
    adminId: actor.id,
    action: "withdrawal.reject",
    targetType: "transaction",
    targetId: transactionId,
    detail: { reason: reason || null },
  });

  revalidatePath("/admin/withdrawals");
  return { ok: true };
}

/**
 * Records that an above-threshold withdrawal's extra verification happened.
 *
 * The verification MECHANISM is deliberately not built: whether it is a
 * re-uploaded ID, a video call or an OTP is an operational decision nobody has
 * made yet. This gates the payout on a human confirming it happened
 * out-of-band, which is honest, rather than implementing a fake check that
 * looks like verification and verifies nothing.
 */
export async function confirmWithdrawalVerification(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const adminUser = await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_confirm_withdrawal_verification", {
    p_transaction_id: transactionId,
    p_admin_id: adminUser.id,
  });

  if (error) return { error: toRpcError(error, "admin") };

  // The mechanism is out-of-band by design (see the comment above), so this
  // ledger entry is the ONLY record that the check was ever claimed to have
  // happened, and who claimed it.
  await logAdminActivity({
    adminId: adminUser.id,
    action: "withdrawal.confirm_verification",
    targetType: "transaction",
    targetId: transactionId,
  });

  revalidatePath("/admin/withdrawals");
  return { ok: true };
}

/** Sets the markup for one ordered pair. Entered as a percentage. */
export async function setRateMarkup(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const adminUser = await requireAdminUser();

  // Submitted as a single "BASE/QUOTE" value from one select — simpler than
  // two dropdowns that can be set to the same currency.
  const rawPair = String(formData.get("pair") ?? "");
  const [base, quote] = rawPair.split("/");
  const rawMarkup = String(formData.get("markupPercent") ?? "");
  const markupPercent = Number(rawMarkup);

  // Echoed on every failure so a rejected edit does not clear the pair the
  // admin picked and the number they typed.
  const values = { pair: rawPair, markupPercent: rawMarkup };

  if (!base || !quote || !isCurrency(base) || !isCurrency(quote)) {
    return { error: "Select a currency pair.", values };
  }
  if (base === quote) return { error: "Base and quote currency must differ.", values };
  if (!Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent >= 100) {
    return { error: "Enter a markup between 0 and 99.99 percent.", values };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_rate_markup", {
    p_base_currency: base as Currency,
    p_quote_currency: quote as Currency,
    // Stored as a fraction. The form takes a percentage because that is how an
    // operator thinks about a spread; the conversion happens once, here.
    p_markup_rate: markupPercent / 100,
    p_set_by: adminUser.id,
  });

  if (error) return { error: toRpcError(error, "admin"), values };

  await logAdminActivity({
    adminId: adminUser.id,
    action: "rate_markup.set",
    targetType: "pair",
    targetId: `${base}/${quote}`,
    detail: { markupPercent },
  });

  /**
   * GROUP 9a — the tag, before the paths.
   *
   * This is THE action the tag exists for: it is the one an operator takes
   * and then immediately looks at a number to confirm. The display cache
   * (src/lib/rates/cache.ts) holds markup rows for 30 seconds and a path
   * revalidation does not reach into it, so without this line the operator
   * would reload /admin/rates and read the spread they just replaced.
   *
   * updateTag, not revalidateTag: called from a Server Action, so it gives
   * read-your-own-writes for the render that follows this return.
   */
  updateTag(RATES_CACHE_TAG);

  revalidatePath("/admin/rates");
  revalidatePath("/convert");
  // The board carries this spread on these too.
  revalidatePath("/home");
  revalidatePath("/accounts", "layout");
  return { ok: true };
}

/**
 * Sets the operator-tunable settings. These were hardcoded constants; the
 * automation threshold in particular was a literal buried three files from any
 * admin surface, so changing the risk appetite of the payout system needed a
 * deploy.
 */
export async function setAppSetting(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const adminUser = await requireAdminUser();
  const key = String(formData.get("key") ?? "");
  const rawValue = String(formData.get("value") ?? "").trim();

  // settingKey scopes settingValue to the one form that failed — /admin/rates
  // renders one form per setting over a single shared action state.
  const values = { settingKey: key, settingValue: rawValue };

  const allowed = Object.values(SETTING_KEYS) as string[];
  if (!allowed.includes(key)) return { error: "Unknown setting.", values };

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) return { error: "Enter a valid number.", values };

  // Per-setting sanity bounds. A fee rate typed as "5" meaning 5% would be
  // stored as 500%, and a zero threshold would route every withdrawal to
  // manual review — both are easy slips with expensive consequences.
  if (key === SETTING_KEYS.withdrawalFeeRate && value >= 1) {
    return { error: "The fee rate is a fraction, e.g. 0.01 for 1%.", values };
  }
  if (key === SETTING_KEYS.automatedPayoutThresholdUsd && value <= 0) {
    return { error: "The threshold must be greater than zero.", values };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_setting", {
    p_key: key,
    p_value: String(value),
    p_set_by: adminUser.id,
  });

  if (error) return { error: toRpcError(error, "admin"), values };

  // The payout threshold and the fee rate change how money moves for every
  // user, with no other trace than this.
  await logAdminActivity({
    adminId: adminUser.id,
    action: "setting.set",
    targetType: "setting",
    targetId: key,
    detail: { value },
  });

  revalidatePath("/admin/rates");
  return { ok: true };
}

/**
 * Send a test email to the signed-in admin.
 *
 * WHY: there was no way to find out whether email worked short of moving real
 * money and waiting to see if a receipt arrived. Every send in this codebase
 * deliberately swallows its failure (an email provider being down must never
 * fail a withdrawal that has already happened), which is right — and means a
 * misconfigured sender domain is completely silent until a customer says they
 * never got anything.
 *
 * TO THE ACTOR'S OWN ADDRESS, never to one typed into a box. An admin-only
 * endpoint that sends mail to an arbitrary address is an open relay with our
 * domain's reputation attached, and the only address worth testing is one the
 * person running the test can read.
 *
 * The three outcomes are reported separately, because "not configured" and
 * "configured but rejected" need completely different actions and sendEmail
 * returns false for both.
 */
export async function sendTestEmail(): Promise<AdminActionState> {
  const actor = await requireAdminUser();

  if (!process.env.RESEND_API_KEY) {
    return {
      error:
        "RESEND_API_KEY isn't set in this environment, so nothing was sent. Email is skipped entirely rather than failing — set the key and try again.",
    };
  }

  const delivered = await sendEmail({
    to: actor.email,
    subject: "justpae email test",
    preheader: "If you're reading this, outbound email works.",
    heading: "Email is working",
    bodyParagraphs: [
      "An admin sent this from the justpae admin tools to check that outbound email is configured correctly.",
      "Nothing about your account changed, and no customer was emailed.",
    ],
  });

  if (!delivered) {
    return {
      error:
        "The email provider rejected that. The most common cause is a sending domain that isn't verified yet — the provider's own message is in the server logs.",
    };
  }

  await logAdminActivity({
    adminId: actor.id,
    action: "email.test",
    targetType: "admin",
    targetId: actor.id,
  });

  return { ok: true };
}

/**
 * A short-lived signed URL for one KYC document, so a reviewer can actually
 * look at what they are approving.
 *
 * WHAT THIS REPLACES: the queue printed `file_ref` — a path into a private
 * bucket, which is neither viewable nor a URL. A reviewer deciding whether to
 * reject somebody's account was shown a string like
 * `<uuid>/government-id/1699….jpg` and nothing else, which means the review was
 * either being done through the Supabase dashboard or not at all.
 *
 * SIGNED ON DEMAND, not per row at render time. Most rows are never opened, and
 * signing every document on every page load would be a storage request per
 * document per view — plus a page whose HTML contains live URLs to every queued
 * applicant's identity documents, which is a far worse thing to leave sitting
 * in a browser history or a proxy cache than a slow page is.
 *
 * LOGGED. Opening a customer's identity document is exactly the read the ledger
 * exists to record: "who looked at this person's passport" is a question an
 * investigation asks, and a log of only writes cannot answer it.
 */
const KYC_SIGNED_URL_TTL_SECONDS = 120;

export async function signKycDocument(
  userId: string,
  path: string,
): Promise<{ url?: string; error?: string }> {
  const actor = await requireAdminUser();

  // The path must belong to the applicant whose row was clicked. Without this
  // the action takes an arbitrary bucket path from the client and signs it,
  // turning an admin page into a read primitive for the entire bucket. Uploads
  // are stored under `<user_id>/…` (see clientUpload), so the prefix IS the
  // ownership claim — checked here rather than trusted.
  if (!userId || !path || !path.startsWith(`${userId}/`)) {
    return { error: "That document doesn't belong to this applicant." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(KYC_BUCKET)
    .createSignedUrl(path, KYC_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error("[admin.signKycDocument] failed", error);
    return { error: "Couldn't open that document. It may have been removed." };
  }

  await logAdminActivity({
    adminId: actor.id,
    action: "kyc.view_document",
    targetType: "user",
    targetId: userId,
    detail: { path },
  });

  return { url: data.signedUrl };
}

import { renderEmail, type EmailOptions } from "@/lib/email/layout";

/**
 * Server-only. Sends the app's own transactional email.
 *
 * ONE DESIGN, NOT TWO. Every message built here goes through renderEmail() from
 * src/lib/email/layout.ts — the same shell scripts/build-emails.ts uses to
 * generate the Supabase auth templates. There is deliberately no second
 * template system: a brand change has exactly one place to happen, and a
 * transactional email cannot drift away from the auth emails it sits beside in
 * the same inbox.
 *
 * NO SDK. Resend's HTTP API is one POST with a JSON body, so it is called
 * directly with fetch rather than adding a dependency whose only job is to
 * build that request. Nothing here needs streaming, retries-with-backoff or
 * batch send.
 *
 * NEVER THROWS. Email is a notification channel, never a prerequisite. A
 * withdrawal that completed must not report failure because an email provider
 * was down, and a PIN that locked must still be locked. Every function here
 * resolves to a boolean and logs its own failures.
 *
 * NO PROVIDER NAMES. Customer-facing copy never names Busha, Klasha or any
 * other upstream — the user has a relationship with justpae, and naming a
 * provider in an email about their money is both confusing and an invitation to
 * phish them with it.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Must be an address on a domain verified with the email provider —
 * justpae.com. A from-address on an unverified domain is silently dropped or
 * spam-foldered, which looks exactly like "the email code is broken".
 */
function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "justpae <no-reply@justpae.com>";
}

/**
 * Where KYC submissions and other operational alerts go. Comma-separated so one
 * Vercel env var covers a whole ops team.
 */
export function adminNotificationRecipients(): string[] {
  return (process.env.ADMIN_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface SendEmailInput extends EmailOptions {
  to: string | string[];
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const { to, ...options } = input;
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) return false;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Not an error in local development or in a deploy where email is not yet
    // configured. Logged at warn so it is visible without being alarming, and
    // the subject is included so "did that email go?" is answerable from logs.
    console.warn("[email] RESEND_API_KEY is not set, skipping send", {
      subject: options.subject,
      recipients: recipients.length,
    });
    return false;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: recipients,
        subject: options.subject,
        html: renderEmail(options),
      }),
    });

    if (!response.ok) {
      // Body text, not just status: the provider's own message names the actual
      // problem (unverified domain, invalid recipient) and a bare 422 does not.
      const body = await response.text().catch(() => "");
      console.error("[email] send failed", {
        status: response.status,
        subject: options.subject,
        body: body.slice(0, 500),
      });
      return false;
    }

    return true;
  } catch (err) {
    console.error("[email] send threw", {
      subject: options.subject,
      error: err instanceof Error ? err.message : err,
    });
    return false;
  }
}

/** Shared escaping for anything user-supplied that lands in email HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── The Phase 1 security notifications ──────────────────────────────────────
// Both are security notices rather than calls to action, so neither carries a
// button. See the comment on EmailOptions.button.

/**
 * Sent on the attempt that locks the PIN, exactly once — not on every
 * subsequent attempt against an already-locked PIN. record_pin_failure returns
 * `just_locked` for precisely this.
 *
 * This is the one signal a user gets that someone is guessing at their PIN,
 * which makes it worth sending even though they may well be the one who
 * mistyped it five times.
 */
export async function sendPinLockedEmail(params: {
  to: string;
  minutes: number;
}): Promise<boolean> {
  const { to, minutes } = params;
  return sendEmail({
    to,
    subject: "Your justpae transaction PIN is temporarily locked",
    preheader: `Too many incorrect attempts. You can try again in ${minutes} minutes.`,
    heading: "Your transaction PIN is locked",
    bodyParagraphs: [
      `We blocked your transaction PIN after too many incorrect attempts. You'll be able to use it again in about <strong>${minutes} minutes</strong>.`,
      "Nothing has moved out of your account, and your balances are untouched.",
    ],
    closingParagraphs: [
      "If this wasn't you, change your password now and get in touch with us straight away — someone may have your sign-in details.",
      "If it was you and you've forgotten your PIN, you can change it from Settings once the lock lifts. You'll need your password.",
    ],
  });
}

/**
 * A support message landed — for the team when a customer writes in, for the
 * customer when the team replies.
 *
 * The preview is truncated and the email never carries the full thread: an
 * inbox is not the place to mirror a support conversation that may contain
 * account detail, and "you have a reply, here is where to read it" is the
 * whole job.
 */
export async function sendSupportMessageEmail(params: {
  to: string | string[];
  fromName: string;
  preview: string;
  forAdmin: boolean;
}): Promise<boolean> {
  const { to, fromName, preview, forAdmin } = params;
  const trimmed = preview.length > 200 ? `${preview.slice(0, 200)}…` : preview;

  return sendEmail({
    to,
    subject: forAdmin
      ? `New support message from ${fromName}`
      : "justpae support replied to you",
    preheader: forAdmin ? trimmed : "You have a reply from our support team.",
    heading: forAdmin ? "New support message" : "We've replied",
    bodyParagraphs: forAdmin
      ? [
          `<strong>${escapeHtml(fromName)}</strong> wrote in:`,
          `<em>${escapeHtml(trimmed)}</em>`,
        ]
      : [
          "Our support team has replied to your message.",
          `<em>${escapeHtml(trimmed)}</em>`,
        ],
    button: {
      label: forAdmin ? "Open the inbox" : "Read the reply",
      href: forAdmin ? `${appUrl()}/admin/support` : `${appUrl()}/support`,
    },
  });
}

/** Where links in transactional email point. */
function appUrl(): string {
  return (process.env.APP_URL ?? "https://justpae.com").replace(/\/$/, "");
}

// ── KYC ─────────────────────────────────────────────────────────────────────

/** To the ops team, when someone submits documents for review. */
export async function sendKycSubmittedEmail(params: {
  to: string[];
  userEmail: string;
  kycType: string;
}): Promise<boolean> {
  const { to, userEmail, kycType } = params;
  return sendEmail({
    to,
    subject: `KYC submitted — ${userEmail}`,
    preheader: `A ${kycType} verification is waiting for review.`,
    heading: "A verification is waiting",
    bodyParagraphs: [
      `<strong>${escapeHtml(userEmail)}</strong> submitted a ${escapeHtml(kycType)} verification.`,
    ],
    button: { label: "Review it", href: `${appUrl()}/admin/kyc` },
  });
}

export async function sendKycApprovedEmail(params: { to: string }): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "You're verified on justpae",
    preheader: "Withdrawals are now open on your account.",
    heading: "You're verified",
    bodyParagraphs: [
      "Your identity check is approved. Withdrawals are now open — you can send money out to your bank, mobile money or wallet.",
    ],
    button: { label: "Go to your account", href: `${appUrl()}/home` },
  });
}

export async function sendKycRejectedEmail(params: {
  to: string;
  reason: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "We need another look at your documents",
    preheader: "Your verification needs one more thing before we can approve it.",
    heading: "We need another look",
    bodyParagraphs: [
      "We couldn't verify your details from what you sent. Here's what our team said:",
      `<em>${escapeHtml(params.reason)}</em>`,
      "Fix that and send it again — everything else about your account is unchanged, and you can still deposit and convert in the meantime.",
    ],
    button: { label: "Fix and resubmit", href: `${appUrl()}/onboarding/kyc/status` },
  });
}

// ── Money movement ──────────────────────────────────────────────────────────
// All four are statements of fact, so none carries a button. See the comment on
// EmailOptions.button: an email about money whose only action is "sign in" is
// training people to click links in emails about their money.

export async function sendDepositCreditedEmail(params: {
  to: string;
  amount: string;
  currency: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: `${params.currency} deposit received`,
    preheader: `${params.amount} has landed in your ${params.currency} wallet.`,
    heading: "Your deposit landed",
    bodyParagraphs: [
      `<strong>${escapeHtml(params.amount)}</strong> is now in your ${escapeHtml(params.currency)} wallet.`,
    ],
    closingParagraphs: ["You can see the full detail in your transactions."],
  });
}

export async function sendConversionCompletedEmail(params: {
  to: string;
  fromAmount: string;
  toAmount: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "Your conversion is done",
    preheader: `${params.fromAmount} converted to ${params.toAmount}.`,
    heading: "Conversion complete",
    bodyParagraphs: [
      `<strong>${escapeHtml(params.fromAmount)}</strong> became <strong>${escapeHtml(params.toAmount)}</strong> at the rate you were shown.`,
    ],
    closingParagraphs: ["The full rate breakdown is on the transaction in your account."],
  });
}

export async function sendWithdrawalCompletedEmail(params: {
  to: string;
  amount: string;
  destination: string | null;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "Your withdrawal has been sent",
    preheader: `${params.amount} is on its way.`,
    heading: "Your withdrawal is on its way",
    bodyParagraphs: [
      `<strong>${escapeHtml(params.amount)}</strong> has been sent${
        params.destination ? ` to ${escapeHtml(params.destination)}` : ""
      }.`,
      "How long it takes to arrive depends on the receiving bank or wallet.",
    ],
    closingParagraphs: [
      "If this wasn't you, contact us immediately and change your password.",
    ],
  });
}

export async function sendWithdrawalFailedEmail(params: {
  to: string;
  amount: string;
  reason: string | null;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "Your withdrawal didn't go through",
    preheader: `${params.amount} has been returned to your wallet.`,
    heading: "That withdrawal didn't go through",
    bodyParagraphs: [
      // The refund is the headline. "Your withdrawal failed" with no mention
      // of where the money went is the most alarming email a fintech can send.
      `<strong>${escapeHtml(params.amount)}</strong> has been put straight back into your wallet. Nothing is missing.`,
      ...(params.reason ? [`Reason: <em>${escapeHtml(params.reason)}</em>`] : []),
    ],
    closingParagraphs: [
      "You can try again whenever you like. If it keeps failing, get in touch and we'll look at it with you.",
    ],
  });
}

/**
 * Sent when a payout recipient is replaced. The masked destination is the
 * whole point: enough to recognise, useless to an attacker reading the same
 * inbox.
 */
export async function sendRecipientChangedEmail(params: {
  to: string;
  currency: string;
  previousDestination: string | null;
  newDestination: string | null;
  holdHours: number;
}): Promise<boolean> {
  const { to, currency, previousDestination, newDestination, holdHours } = params;

  const change =
    previousDestination && newDestination
      ? `from <strong>${escapeHtml(previousDestination)}</strong> to <strong>${escapeHtml(newDestination)}</strong>`
      : newDestination
        ? `to <strong>${escapeHtml(newDestination)}</strong>`
        : "to a new destination";

  return sendEmail({
    to,
    subject: `Your ${currency} payout account was changed`,
    preheader: `Your ${currency} payout destination was updated. Withdrawals to it need approval for ${holdHours} hours.`,
    heading: `Your ${escapeHtml(currency)} payout account was changed`,
    bodyParagraphs: [
      `Your ${escapeHtml(currency)} payout destination was changed ${change}.`,
      `As a precaution, withdrawals to this new destination will be reviewed by our team for the next <strong>${holdHours} hours</strong> instead of being paid out automatically.`,
    ],
    closingParagraphs: [
      "If you didn't make this change, contact us immediately and change your password. We can stop any withdrawal that hasn't been paid out yet.",
    ],
  });
}

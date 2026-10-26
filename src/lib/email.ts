// Relative, with extension: email.test.ts runs under `node --test` with no
// bundler, so no "@/" alias resolution — see src/lib/cny/priceCore.ts for the
// same note. layout.ts has no imports of its own, so this is the only
// specifier in the chain that needs it.
import { renderEmail, renderEmailText, type EmailButton, type EmailOptions } from "./email/layout.ts";

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
        text: renderEmailText(options),
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The admin notification composer's "also send by email", for one person or
 * for every announcement-opted-in user at once.
 *
 * BATCHED, NOT ONE CALL PER RECIPIENT. A broadcast can be every user on the
 * platform, and Resend's batch endpoint takes up to 100 emails in a single
 * request — one array entry per recipient, each its own `to`, so nobody in
 * the list can see anybody else's address. Chunking at 100 is the provider's
 * own documented limit, not a number chosen here.
 *
 * Callers run this through next/server's after() so a slow or failed email
 * send can never hold up — or fail — the admin action that queued it. This
 * function reflects that in its own shape: it never throws, and it returns a
 * count rather than letting one bad chunk abort the rest.
 */
export async function sendAnnouncementEmails(params: {
  recipients: string[];
  subject: string;
  preheader: string;
  heading: string;
  bodyParagraphs: string[];
  button?: EmailButton;
}): Promise<{ sent: number; failed: number }> {
  const recipients = Array.from(new Set(params.recipients.filter(Boolean)));
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY is not set, skipping announcement send", {
      subject: params.subject,
      recipients: recipients.length,
    });
    return { sent: 0, failed: recipients.length };
  }

  const { subject, preheader, heading, bodyParagraphs, button } = params;
  const html = renderEmail({ subject, preheader, heading, bodyParagraphs, button });
  const text = renderEmailText({ subject, preheader, heading, bodyParagraphs, button });
  const from = fromAddress();

  let sent = 0;
  let failed = 0;

  for (const batch of chunk(recipients, 100)) {
    try {
      const response = await fetch(`${RESEND_ENDPOINT}/batch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch.map((to) => ({ from, to, subject, html, text }))),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        // Count only — never the addresses themselves, in a log line that
        // could end up somewhere less access-controlled than the database.
        console.error("[email] announcement batch failed", {
          status: response.status,
          batchSize: batch.length,
          body: body.slice(0, 500),
        });
        failed += batch.length;
        continue;
      }

      sent += batch.length;
    } catch (err) {
      console.error("[email] announcement batch threw", {
        batchSize: batch.length,
        error: err instanceof Error ? err.message : err,
      });
      failed += batch.length;
    }
  }

  return { sent, failed };
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
export function appUrl(): string {
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

/**
 * GROUP 3 — Dojah is down or its wallet is empty (402). Sent at most once per
 * cooldown: the caller claims the right to send via claim_provider_alert
 * (migration 0044) before calling this, so a provider outage that touches a
 * hundred BVN saves emails the ops team once, not a hundred times.
 */
export async function sendAdminBvnValidationDownEmail(params: { to: string[] }): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "BVN validation is unavailable",
    preheader: "BVNs are being saved unverified while Dojah is unreachable.",
    heading: "BVN validation is down",
    bodyParagraphs: [
      "Dojah is not responding, or its wallet is empty. New BVNs are still being saved — marked unverified — and Korapay's own check still runs when an account number is issued, so nobody is blocked.",
      "Worth checking Dojah's status or account balance.",
    ],
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

// ── Pay to China ────────────────────────────────────────────────────────────
//
// Four emails over one request's life, because a Pay to China request is the
// only money movement in this product that a HUMAN settles — it can sit for
// hours, and silence over those hours is indistinguishable from the money
// having vanished. Every state change says so.
//
// None of them names a payout provider or says "exchange", same rule as every
// other message in this file.

export async function sendPayToChinaSubmittedEmail(params: {
  to: string;
  amount: string;
  cnyAmount: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "We've got your China payment request",
    preheader: `${params.amount} to send ${params.cnyAmount} to your recipient.`,
    heading: "Your payment request is in",
    bodyParagraphs: [
      `We've taken <strong>${escapeHtml(params.amount)}</strong> from your wallet to send <strong>${escapeHtml(params.cnyAmount)}</strong> to your recipient in China.`,
      "Our team pays these by hand, so it isn't instant. We'll email you the moment it's on its way, and again with the receipt once it lands.",
    ],
    closingParagraphs: [
      "If anything is wrong with the recipient details, tell us now — we can stop a payment that hasn't gone out yet, and your money comes straight back.",
    ],
  });
}

export async function sendPayToChinaProcessingEmail(params: {
  to: string;
  cnyAmount: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "Your China payment is being paid now",
    preheader: `${params.cnyAmount} is being sent to your recipient.`,
    heading: "We're paying your recipient",
    bodyParagraphs: [
      `<strong>${escapeHtml(params.cnyAmount)}</strong> is being sent to your recipient in China right now.`,
    ],
    closingParagraphs: ["We'll send you the receipt as soon as it's confirmed."],
  });
}

export async function sendPayToChinaCompletedEmail(params: {
  to: string;
  cnyAmount: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "Your China payment has landed",
    preheader: `${params.cnyAmount} reached your recipient.`,
    heading: "Paid",
    bodyParagraphs: [
      `<strong>${escapeHtml(params.cnyAmount)}</strong> has reached your recipient in China.`,
    ],
    closingParagraphs: [
      "The payment receipt is attached to this transaction in your account — open it to see the proof of payment.",
    ],
  });
}

export async function sendPayToChinaRejectedEmail(params: {
  to: string;
  amount: string;
  reason: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "We couldn't send your China payment",
    preheader: `${params.amount} has been returned to your wallet.`,
    heading: "We couldn't send that payment",
    bodyParagraphs: [
      // THE REFUND IS THE FIRST THING SAID. A customer reading "we couldn't
      // pay your supplier" wants to know where their money is before they
      // want to know why, and burying that under the reason is how a support
      // ticket gets written in the ninety seconds before they read on.
      `<strong>${escapeHtml(params.amount)}</strong> is back in your wallet in full.`,
      `The reason: ${escapeHtml(params.reason)}`,
    ],
    closingParagraphs: [
      "Fix the details and try again, or contact us if you'd like a hand with it.",
    ],
  });
}

/** Operational alert, to the ops inbox, on every new request. */
export async function sendAdminPayToChinaAlertEmail(params: {
  to: string[];
  userEmail: string;
  amount: string;
  cnyAmount: string;
  payoutMethod: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: `Pay to China — ${params.cnyAmount} for ${params.userEmail}`,
    preheader: `${params.amount} debited; ${params.cnyAmount} to pay by ${params.payoutMethod}.`,
    heading: "A China payment is waiting",
    bodyParagraphs: [
      `<strong>${escapeHtml(params.userEmail)}</strong> paid <strong>${escapeHtml(params.amount)}</strong> to send <strong>${escapeHtml(params.cnyAmount)}</strong> by ${escapeHtml(params.payoutMethod)}.`,
    ],
    button: { label: "Open the queue", href: `${appUrl()}/admin/pay-to-china` },
  });
}

// ── Manual NGN bank-transfer deposits (migration 0037) ──────────────────────
// Both customer-facing messages are statements of fact and carry no button,
// for the reason on EmailOptions.button. The ops alert does, because its whole
// purpose is to get somebody into the queue.
//
// None of these names a bank-transfer rail operator or uses the word
// "exchange": the customer transferred money to justpae's account, and that is
// the whole of what happened.

/** To the ops team, when a customer says they have made the transfer. */
export async function sendAdminManualDepositSentEmail(params: {
  to: string[];
  userEmail: string;
  amount: string;
  reference: string;
  hasScreenshot: boolean;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: `Naira deposit to review — ${params.reference}`,
    preheader: `${params.userEmail} says they sent ${params.amount}.`,
    heading: "A naira deposit is waiting",
    bodyParagraphs: [
      `<strong>${escapeHtml(params.userEmail)}</strong> says they have transferred <strong>${escapeHtml(params.amount)}</strong> with the narration <strong>${escapeHtml(params.reference)}</strong>.`,
      params.hasScreenshot
        ? "They attached a screenshot."
        : "No screenshot was attached — match it by the reference on the statement.",
      // The one rule that cannot be enforced from an inbox.
      "Credit the amount that actually arrived, not the amount they asked for.",
    ],
    button: { label: "Open the queue", href: `${appUrl()}/admin/deposits` },
  });
}

/** To the customer, when an admin rejects their claimed transfer. */
export async function sendManualDepositRejectedEmail(params: {
  to: string;
  amount: string;
  reference: string;
  reason: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "We couldn't confirm your naira deposit",
    preheader: `Nothing was taken from your account for ${params.reference}.`,
    heading: "We couldn't confirm that deposit",
    bodyParagraphs: [
      // Said first, because it is the only thing the reader actually wants to
      // know: we never debited them, so there is nothing of theirs with us.
      `We couldn't match a transfer to your request <strong>${escapeHtml(params.reference)}</strong> for <strong>${escapeHtml(params.amount)}</strong>. Nothing was taken from your account by us.`,
      `The reason: <em>${escapeHtml(params.reason)}</em>`,
      "If you did send the money, reply to this with your bank's transfer receipt and we'll trace it.",
    ],
    closingParagraphs: [
      "To try again, start a new deposit — it comes with a new reference, and the old one is closed.",
    ],
  });
}

// ── Treasury alerts (migrations 0041 and 0042) ──────────────────────────────
// Ops-only, and still provider-agnostic in their wording. The admin SCREEN
// names both providers, because an operator choosing between two vendors
// needs their names; an email does not — "the deposit balance" and "the
// payout balance" say which figure moved, and nothing travels further than
// an inbox by mistake.

/** A withdrawal is waiting because the payout balance cannot cover it. */
export async function sendAdminPayoutBalanceEmail(params: {
  to: string[];
  reason: string;
  currency: string;
  amount: string;
  transactionId: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: `Payout held — ${params.reason}`,
    preheader: `${params.amount} is waiting on the ${params.currency} payout balance.`,
    heading: "A withdrawal is waiting on the payout balance",
    bodyParagraphs: [
      `<strong>${escapeHtml(params.amount)}</strong> could not be sent: ${escapeHtml(params.reason)}.`,
      "The provider was not called and the customer's money is still held. Top the balance up and the retry sends it, oldest first.",
    ],
    button: { label: "Open the treasury", href: `${appUrl()}/admin/treasury` },
  });
}

/** A sweep moved money from the deposit balance to the payout balance. */
export async function sendAdminSweepEmail(params: {
  to: string[];
  amount: string;
  automatic: boolean;
  depositBalance: string;
  payoutBalance: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: `Treasury sweep — ${params.amount} to the payout balance`,
    preheader: `${params.amount} moved to the payout funding account.`,
    heading: params.automatic ? "The daily sweep ran" : "A sweep was run by hand",
    bodyParagraphs: [
      `<strong>${escapeHtml(params.amount)}</strong> was sent from the deposit balance to the payout funding account.`,
      `The deposit balance now holds <strong>${escapeHtml(params.depositBalance)}</strong>; the payout balance holds <strong>${escapeHtml(params.payoutBalance)}</strong>, which updates when the transfer lands.`,
    ],
    button: { label: "Open the treasury", href: `${appUrl()}/admin/treasury` },
  });
}

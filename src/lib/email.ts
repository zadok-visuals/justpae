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

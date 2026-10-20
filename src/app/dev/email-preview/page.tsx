import { notFound } from "next/navigation";
import { renderEmail, renderEmailText, type EmailOptions } from "@/lib/email/layout";

/**
 * Development-only: every shape renderEmail() produces, side by side.
 *
 * An inbox renders an email once, days apart from the next one, so a design
 * mistake — a heading that isn't actually serif, a button short of 48px, a
 * footer missing the address — is easy to ship unnoticed. Rendering every
 * shape on one page, raw HTML included, makes that a glance instead of a
 * round trip through "send yourself a test email and check Gmail".
 *
 * Each sample is built straight from renderEmail()/renderEmailText(), the
 * same two functions every real sender in src/lib/email.ts calls — not a
 * hand-copied approximation of them — so this page can only go stale by the
 * design itself changing, never by drifting from it.
 *
 * Gated the same way /dev/gallery is.
 */

const CODE_PANEL = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-panel-bg" bgcolor="#f7f5f0" style="background-color:#f7f5f0;border:1px solid #e7e2d8;border-radius:10px;">
  <tr>
    <td align="center" style="padding:20px 0;">
      <span class="email-panel-text" style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#1c1a17;">482913</span>
    </td>
  </tr>
</table>`;

const SAMPLES: { name: string; options: EmailOptions }[] = [
  {
    name: "Confirm signup (OTP + button)",
    options: {
      subject: "Your justpae verification code",
      preheader: "Your verification code is inside — it expires in about an hour.",
      heading: "Confirm your email",
      bodyParagraphs: [
        "Use the code below to confirm your email and finish setting up your justpae account.",
        "It expires in about an hour.",
      ],
      panelHtml: CODE_PANEL,
      button: { label: "Confirm my email", href: "https://justpae.com/auth/confirm?token_hash=…&type=signup&next=/home" },
      fallbackIntro: "Rather tap than type? If the button doesn't work, copy this address into your browser:",
      closingParagraphs: ["If you didn't request this, you can ignore this email — no account is created until the code or link is used."],
    },
  },
  {
    name: "Withdrawal sent (statement, no button)",
    options: {
      subject: "Your withdrawal has been sent",
      preheader: "₦45,000.00 is on its way.",
      heading: "Your withdrawal is on its way",
      bodyParagraphs: [
        "<strong>₦45,000.00</strong> has been sent to GTBank ••1234.",
        "How long it takes to arrive depends on the receiving bank or wallet.",
      ],
      closingParagraphs: ["If this wasn't you, contact us immediately and change your password."],
    },
  },
  {
    name: "KYC rejected (escaped admin text)",
    options: {
      subject: "We need another look at your documents",
      preheader: "Your verification needs one more thing before we can approve it.",
      heading: "We need another look",
      bodyParagraphs: [
        "We couldn't verify your details from what you sent. Here's what our team said:",
        "<em>The photo of your ID was too blurry to read the expiry date.</em>",
        "Fix that and send it again — everything else about your account is unchanged, and you can still deposit and convert in the meantime.",
      ],
      button: { label: "Fix and resubmit", href: "https://justpae.com/onboarding/kyc/status" },
    },
  },
  {
    name: "Admin broadcast (notification composer, with link)",
    options: {
      subject: "Scheduled maintenance on Sunday",
      preheader: "Deposits and withdrawals will be briefly unavailable Sunday 2–3am.",
      heading: "Scheduled maintenance on Sunday",
      bodyParagraphs: ["We're doing some brief maintenance this Sunday between 2am and 3am. Deposits and withdrawals may be unavailable for a few minutes."],
      button: { label: "Open it", href: "https://justpae.com/home" },
    },
  },
];

export default function DevEmailPreview() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <div className="min-h-screen-dvh space-y-10 bg-background py-6">
      {SAMPLES.map(({ name, options }) => {
        const html = renderEmail(options);
        const text = renderEmailText(options);
        return (
          <section key={name} className="border-t border-border pt-4">
            <p className="mb-2 px-4 font-mono text-xs uppercase tracking-wide text-primary sm:px-6">
              {name} — subject: &ldquo;{options.subject}&rdquo;
            </p>
            <iframe
              title={name}
              srcDoc={html}
              className="h-[640px] w-full border-0 bg-white"
              sandbox=""
            />
            <details className="mx-4 mt-2 sm:mx-6">
              <summary className="cursor-pointer text-xs text-muted-foreground">Plain-text part</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-card p-3 text-xs text-foreground">
                {text}
              </pre>
            </details>
          </section>
        );
      })}
    </div>
  );
}

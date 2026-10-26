/**
 * Generates supabase/email-templates/*.html from src/lib/email/layout.ts.
 *
 * Run with `npm run emails:build`. The two files it writes ARE committed —
 * Supabase's dashboard has no API this could push to directly, so the
 * generated HTML has to exist in the repo to be copy-pasted in. Hand-editing
 * either .html file directly will work until the next `emails:build` run
 * silently overwrites it; change the content below, or the shared layout,
 * instead.
 *
 * Supabase's own template variables ({{ .Token }}, {{ .TokenHash }},
 * {{ .SiteURL }}, {{ .Type }}) are plain text as far as this script and
 * layout.ts are concerned — they pass through untouched and are expanded by
 * Supabase itself only after the HTML is pasted into its dashboard.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { renderEmail } from "../src/lib/email/layout.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../supabase/email-templates");

const CODE_PANEL = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-panel-bg" bgcolor="#f6f7f9" style="background-color:#f6f7f9;border:1px solid #eaecf0;border-radius:10px;">
  <tr>
    <td align="center" style="padding:20px 0;display:flex;align-items:center;justify-content:center;gap:8px;">
      <span class="email-panel-text" style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#0b0d10;">{{ .Token }}</span>
      <span style="font-size:24px;" aria-label="Copy code" role="img">📋</span>
    </td>
  </tr>
</table>`;

function withHeader(subjectComment: string, pasteTarget: string, body: string): string {
  return `<!--
  Suggested subject line: "${subjectComment}"

  GENERATED FILE — do not hand-edit. Produced by scripts/build-emails.ts from
  src/lib/email/layout.ts; running "npm run emails:build" overwrites this.

  Paste into Supabase dashboard → Authentication → Emails → "${pasteTarget}",
  and set the subject line above there too (Supabase does not read it from
  this comment). See README.md in this directory for the full new-project
  checklist and why these use {{ .TokenHash }} / {{ .Token }} rather than
  {{ .ConfirmationURL }}.
-->
${body}`;
}

const confirmSignup = withHeader(
  "Your justpae verification code",
  "Confirm signup",
  renderEmail({
    subject: "Your justpae verification code",
    preheader: "Your verification code is inside — it expires in about an hour.",
    heading: "Confirm your email",
    bodyParagraphs: [
      "Use the code below to confirm your email and finish setting up your justpae account.",
      "It expires in about an hour.",
    ],
    panelHtml: CODE_PANEL,

    closingParagraphs: [
      "If you didn't request this, you can ignore this email — no account is created until the code or link is used.",
    ],
  }),
);

const resetPassword = withHeader(
  "Reset your justpae password",
  "Reset password",
  renderEmail({
    subject: "Reset your justpae password",
    preheader: "Reset your justpae password — this link expires in about an hour.",
    heading: "Reset your password",
    bodyParagraphs: [
      "Tap the button below to choose a new password for your justpae account.",
      "This link works in any browser and expires in about an hour.",
    ],
    button: {
      label: "Set a new password",
      href: "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password",
    },
    closingParagraphs: [
      "If you didn't request this, you can ignore this email — your password stays as it is, and nobody can use this link without opening it.",
    ],
  }),
);

writeFileSync(resolve(OUT_DIR, "confirm-signup.html"), confirmSignup);
writeFileSync(resolve(OUT_DIR, "reset-password.html"), resetPassword);

console.error("Wrote supabase/email-templates/confirm-signup.html");
console.error("Wrote supabase/email-templates/reset-password.html");

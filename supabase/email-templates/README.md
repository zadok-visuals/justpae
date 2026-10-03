# Auth email templates

**These are not applied by `supabase db push`, and the CLI cannot sync them to a
remote project.** They have to be pasted into the dashboard once per project:

Supabase dashboard → **Authentication → Emails** → pick the template → paste the
matching file's contents → Save.

| Dashboard template | File |
| --- | --- |
| Confirm signup | `confirm-signup.html` |
| Reset password | `reset-password.html` |
| Magic link | not used — the app has no magic-link flow |
| Change email address | `confirm-signup.html` works as-is (`type=email_change`) |
| Invite user | not used |

## Why they can't be left at the defaults

The default templates use `{{ .ConfirmationURL }}`, which produces a PKCE
`code` link. **A PKCE code only verifies in the same browser that requested
it** — the code verifier lives in that browser's storage and nowhere else.

Email links are routinely opened somewhere else:

- signed up on a phone, link tapped on a laptop
- link opened by a desktop mail client in the system browser
- link opened in whatever in-app browser Gmail or Outlook embeds

In all three the code exchange fails and the person sees "link expired" on a
link that is minutes old and perfectly valid. This is one of the most common
and most invisible signup-funnel failures in a Supabase app, because it works
every time on the developer's own machine.

`confirm-signup.html` leads with `{{ .Token }}`, the 6-digit code — the app's
`/auth/verify` page asks for it directly, and a code the user types in has no
same-browser assumption to break in the first place. The `{{ .TokenHash }}`
link further down is kept as a secondary option for anyone who'd rather tap
than type; it points at `/auth/confirm`, which calls
`verifyOtp({ type, token_hash })` — a token hash, unlike a PKCE code, carries
everything needed to verify on its own, so the link works in any browser on
any device too.

`/auth/callback` still does the code exchange — that path is OAuth only, where
the same-browser assumption genuinely holds.

## Before pasting

Replace `{{ .SiteURL }}` — the templates use it, and it resolves to the
project's **Site URL**, so set that first:

Dashboard → **Authentication → URL Configuration**

- **Site URL** — the deployed origin, e.g. `https://justpae.example`. Every
  link in these emails is built from it. Leaving it at `http://localhost:3000`
  sends production users confirmation links to their own laptops.
- **Redirect URLs** — add `https://<your-domain>/auth/callback` and
  `https://<your-domain>/auth/confirm`, plus the Vercel preview pattern if
  previews need working auth:
  `https://<project>-*.vercel.app/auth/callback`.

This must match `APP_URL` in the app's environment. They are two separate
settings in two separate systems that have to agree.

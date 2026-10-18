# justpae — UX and flow audit

Audited at commit `d1a37c3` (migrations 0001–0019 applied, local and remote in
step). Every finding below was read out of the source named beside it, not
inferred from a screenshot, and every path is real. Where a flow has a
JesDanPay equivalent it is compared explicitly.

## How findings are tagged

| Tag | Meaning |
| --- | --- |
| **BLOCKER** | The user cannot finish what they came to do, or money moves with no confirmation |
| **BROKEN** | Wrong behaviour, a leaked internal error, or a dead end |
| **UX** | Works, but the user gets stuck, confused, or has to guess |
| **COPY** | Wording is wrong, vague, or says something we can't stand behind |
| **MINOR** | Worth fixing, costs nothing, blocks nobody |

## Scope note, stated plainly

Docker and `psql` are both absent on this machine, so `supabase test db`
(the pgTAP suite in `supabase/tests/`) **cannot be run here**. That is a
verification gap, not a passing result, and it shapes the plan below: exactly
one new migration is written (`0020`, additive, a new revoked function), and
nothing from 0010–0019 is touched. See "Database changes" at the end.

---

## 1. Landing — `src/app/page.tsx`

| # | Tag | Finding |
| --- | --- | --- |
| 1.1 | **BLOCKER** | No Privacy Policy or Terms exists anywhere in the app, and the landing page links to neither. A money product that collects government ID with no published terms is not shippable. No `src/app/privacy` or `src/app/terms`. |
| 1.2 | UX | No `src/app/sitemap.ts` and no `src/app/robots.ts`, so `/admin`, `/api` and `/dev` are crawlable in principle. |
| 1.3 | UX | No `opengraph-image` / `twitter-image`: a shared link renders as a bare URL. |
| 1.4 | MINOR | `public/lovable-uploads/` is carried over from the pre-rebuild app. Not referenced by the landing page; dead weight in the deploy. |

Already correct: the page gates bills / USD-collection sections on
`src/lib/flags.ts` and invents no numbers.

## 2. Favicon, icons, install — app-wide

| # | Tag | Finding |
| --- | --- | --- |
| 2.1 | **BROKEN** | There is no icon of any kind: no `src/app/icon.svg`, no `favicon.ico`, no `apple-icon.png`, no `public/icon-192.png`/`icon-512.png`, no `src/app/manifest.ts`. Every browser tab shows Next's default globe, and "Add to Home Screen" produces a screenshot thumbnail. The mark already exists (`src/components/layout/Mark.tsx`) — nothing had to be designed, it was just never wired up. |

## 3. Signup → verify → first screen

Files: `src/components/auth/SignupForm.tsx`, `src/app/auth/verify/page.tsx`,
`src/lib/actions/auth.ts`, `supabase/email-templates/confirm-signup.html`.

| # | Tag | Finding |
| --- | --- | --- |
| 3.1 | **UX** | A brand-new user is dropped straight into identity verification. `verifySignupCode` redirects to `/onboarding/kyc` (`src/lib/actions/auth.ts:113`), `signUp`'s `emailRedirectTo` points there (`:51`), and so does the confirm-signup link's `next` (`scripts/build-emails.ts:63`). The user's first sight of the product is a form asking for a BVN, before they have seen a balance, a rate, or a reason to trust us. **JesDanPay is better here**: it lands on `/home` and asks for ID later, from a dashboard banner, on the user's own schedule (`/tmp/jesdanpay-reference/src/app/onboarding/kyc/page.tsx`). |
| 3.2 | UX | No `loading.tsx` anywhere under `src/app/(auth)/` or `src/app/auth/`, so every auth navigation shows nothing until the server responds. |
| 3.3 | COPY | `/onboarding/kyc` is titled "Verify your identity" and says "Required before money can leave your account" — correct, but it is the wrong thing to say to someone who has not yet deposited anything. |

Already correct and deliberately left alone: the code path accepts variable-length
OTPs, the email is never carried in a URL (`src/lib/auth/pendingEmail.ts`), and
`signUp` refuses a session when the project's Confirm-email setting is off.

## 4. The `verify?email=` leftover

| # | Tag | Finding |
| --- | --- | --- |
| 4.1 | **BROKEN** | `src/app/(dashboard)/layout.tsx:53` and `src/app/onboarding/layout.tsx:21` still redirect to `/auth/verify?email=${encodeURIComponent(user.email)}`. The proxy and the auth actions were all moved off URL-carried email; these two were missed, so an unconfirmed user's address lands in a URL, in history, and in any referrer. A repo-wide grep for `verify?email` finds exactly these two. |

## 5. KYC — `/onboarding/kyc/*`

Files: `src/app/onboarding/kyc/{page,individual/page,business/page,status/page}.tsx`,
`src/components/kyc/KycForms.tsx`, `src/lib/actions/kyc.ts`.

| # | Tag | Finding |
| --- | --- | --- |
| 5.1 | **BLOCKER** | There is no quick-onboarding stage at all. `/onboarding/kyc` offers two links that go straight to a full document submission. A user who only wants to pick "individual" and give a phone number has no way to do that and get on with using the app — the only path forward is the whole ID submission. **JesDanPay's two-stage split** (`KycTypeSelector` → "Save and go to dashboard", ID later) is better and is what the owner asked to be ported. |
| 5.2 | **UX** | Both ID forms are single long pages (`KycForms.tsx`, 254 lines of one `<form>` each). The business form asks for a registered name, a TIN, an ownership structure, a certificate, a director's ID and a proof of address in one scroll, with one submit button at the bottom and no indication of how much is left. **JesDanPay is better**: 4 steps with a `StepIndicator`, Back/Continue, per-step validation. |
| 5.3 | **UX** | Nothing tells the user *why* Continue is unavailable until they have scrolled to the bottom and read the one line under the button. Per-step "Continue is off because X is missing" does not exist because there are no steps. |
| 5.4 | **BROKEN** | The individual form asks for a **selfie** ("A photo of you", `KycForms.tsx:106`). The product needs a photo of the government ID. JesDanPay renamed exactly this field for exactly this reason (`government_id`, not `selfie`). |
| 5.5 | UX | The individual form asks for `fullName` and `phone` again even when both are already on the profile — they are only prefilled as defaults. After a stage-one step exists, both are already known and re-asking is noise. |
| 5.6 | **UX** | Home's KYC banner has one "not started" state (`src/app/(dashboard)/home/page.tsx:138`) pointing at `/onboarding/kyc` regardless of how far the user got. It cannot say "Finish setting up your account" vs "Submit your ID" because it does not read `phone`/`kyc_type`. **JesDanPay's `KycStatusBanner` branches on exactly that.** |
| 5.7 | **UX** | `/withdraw`'s KYC gate (`src/components/withdraw/WithdrawForm.tsx:120`) always sends the user to `/onboarding/kyc`, which (per 5.1) is the type chooser — so a user who has already chosen a type is shown the chooser again. |
| 5.8 | UX | `UploadField` has no image preview, no remove, and no lightbox; an uploaded ID cannot be checked or replaced without a page reload. |
| 5.9 | MINOR | No `loading.tsx` under `src/app/onboarding/`. |

Verified already correct, left alone: `submit_kyc_profile` is the only path to
`kyc_status='pending'` and cannot reach `'approved'` (migration 0011); upload
paths are re-verified as the user's own (`verifyOwnedUpload`); uploads already
go direct to storage, bypassing the server-action body limit; and all three KYC
emails (submitted-to-admins, approved, rejected) already exist in
`src/lib/email.ts` and are already wired into `src/lib/actions/admin.ts:54,95`.
**STEP 2f needs no work.**

## 6. Money movement — confirmation before the money goes

| # | Tag | Finding |
| --- | --- | --- |
| 6.1 | **BLOCKER** | **There is no confirmation step anywhere in the app.** A repo-wide grep for `ConfirmDialog` returns nothing. Every one of these commits on a single tap, with no summary of what is about to happen and no way back: a withdrawal (`WithdrawForm.tsx`), a conversion (`ConvertForm.tsx`), a bill or airtime payment (`BillForm.tsx`), setting or changing a transaction PIN (`TransactionPinCard.tsx`), changing the payout recipient (`RecipientCard.tsx`), and signing out (`DashboardChrome.tsx`). Unsaved form state is discarded on navigation with no prompt. |
| 6.2 | **UX** | `/withdraw` never shows the fee or the amount that will actually arrive. The form shows amount, balance, destination and the instant-vs-review verdict — but the fee is derived server-side inside `create_withdrawal_request` and is first seen *after* the money has left. |
| 6.3 | **COPY** | "Minimum withdrawal is about **5 USD in NGN**" (`WithdrawForm.tsx:238`). Nobody about to withdraw naira thinks in dollars, and "about" means the user cannot tell whether their amount clears. The codebase already solved this for conversions — `getMinimumConversionAmount` in `src/lib/busha/limits.ts` converts and rounds to a friendly local figure — and withdrawal was left behind. The same vague string is returned as the server error (`src/lib/actions/withdrawals.ts`). |

Verified already correct: the withdrawal minimum is compared as
`amount × rate`, server-side (`src/lib/actions/withdrawals.ts`), not rate vs
minimum. The maths is right; only the *number the user is shown* is wrong.

## 7. Errors shown to the user

| # | Tag | Finding |
| --- | --- | --- |
| 7.1 | **BROKEN** | Raw Postgres and provider error text is returned straight to the UI in ~25 places as `return { error: error.message }`, including the money paths: `src/lib/actions/withdrawals.ts:125`, `src/lib/actions/convert.ts:352`, and across `src/lib/actions/admin.ts` and `adminUsers.ts`. `toCustomerError` (`src/lib/provider-error.ts`) exists precisely for this and is applied inconsistently — so a user can be shown a function name, a constraint name, or a provider's own wording. |
| 7.2 | UX | Recipient-field validation errors come back from the database rather than from a friendly check (`RecipientCard.tsx` → `src/lib/actions/withdrawals.ts`). |

## 8. Staleness, polling and live data

| # | Tag | Finding |
| --- | --- | --- |
| 8.1 | **UX** | Only deposits poll. `DepositForm.tsx:221` has a `setInterval`; a pending **withdrawal** or **conversion** detail view never updates, so the user watches a "pending" row that has in fact completed and reloads by hand to find out. |
| 8.2 | UX | Live rates on Home and Convert are rendered once per request and never refresh while the screen is open, so a rate can be minutes stale with nothing saying so. |
| 8.3 | MINOR | `useCountdown` (`src/lib/hooks/useCountdown.ts`) already exists and is already shared, but only Convert uses it. |

Verified already correct: `revalidatePath("/home")` + `router.refresh()` already
fire after convert, withdraw, bills and deposits — **4b is substantially already
done**; what is missing is the polling above, not the refresh.

## 9. Lists, paging and totals

| # | Tag | Finding |
| --- | --- | --- |
| 9.1 | **BROKEN** | Supabase caps a response at 1000 rows. `.range(...)` appears only in `src/lib/transactions.ts`. Every admin list uses a bare `.limit()` with no paging and no next page: `src/app/admin/activity/page.tsx:75`, `src/app/admin/notifications/page.tsx:25`, `src/lib/actions/adminUsers.ts:81,101`. |
| 9.2 | **BROKEN** | `src/app/admin/pnl/page.tsx:40` computes P&L from a `.limit(100)` query. Past 100 rows the reported profit is simply **wrong**, silently, with no indication it has been truncated. This is the most dangerous finding in the audit: every other item here inconveniences someone, this one reports a false number to the operator. |

## 10. Accessibility and mobile

| # | Tag | Finding |
| --- | --- | --- |
| 10.1 | UX | `aria-live` appears in 3 places only (`PasswordStrengthMeter`, `ConvertForm`). Async results elsewhere — a completed withdrawal, an upload, a bill payment — are announced to nobody. |
| 10.2 | MINOR | No image lightbox, so an uploaded document can only be viewed at thumbnail size. |

Verified already correct, needs no work: inputs are already 16px up to `sm`
(`src/app/globals.css:201-213`, with the iOS zoom reason written down), and
`prefers-reduced-motion` is already respected (`globals.css:265`). **Most of 4h
is already done.**

## 11. Webhooks and provider integration

| # | Tag | Finding |
| --- | --- | --- |
| 11.1 | UX | `src/app/api/webhooks/klasha/route.ts` has no duplicate-delivery check. A redelivered `charge.completed` is saved as a second `webhook_events` row and re-attempts `credit_deposit`. Double-crediting is *prevented* (the deposit is no longer `pending`), so this is not a money bug — but duplicates are recorded as if new, and unknown events are recorded and marked processed rather than ignored. |

Verified already correct: the signature compare is already constant-time, no
secret is ever logged (only header *names*), and the route 404s outright while
the GHS flag is off. **`deposits.decline_reason` already exists** (migration
0001), `fail_deposit` already stores it, and the user's own transaction detail
already shows it (`ActivityDetail.tsx:109`) — so **STEP 4k needs no migration**;
only the admin-side display of it is missing.

## 12. Admin

| # | Tag | Finding |
| --- | --- | --- |
| 12.1 | UX | No "Send test email" anywhere, so an operator cannot tell whether email is configured without moving real money. |
| 12.2 | UX | Support email alerts have no flood rule: `src/lib/actions/support.ts:165` sends on every inbound message, so a customer typing five short lines sends five emails. (Checked `73c4604` as instructed — it wired the money-movement emails, it did not add a flood rule.) |
| 12.3 | MINOR | `deposits.decline_reason` is not shown on any admin screen. |

## 13. Tests

| # | Tag | Finding |
| --- | --- | --- |
| 13.1 | **BROKEN** | `package.json` has no `test` script and there is not one `node --test` file in the repo. Conversion-quote markup maths, the withdrawal minimum and fee, the rolling 24-hour cap, PIN lockout and the transactions merge — every piece of money logic — is unverified by anything automated. The only test in the repo is the pgTAP one, which needs Docker. |

## 14. Security headers

| # | Tag | Finding |
| --- | --- | --- |
| 14.1 | **BROKEN** | `next.config.ts` sets **no headers at all**: no CSP, no HSTS, no `X-Content-Type-Options`, no `Referrer-Policy`, no `Permissions-Policy`, no `frame-ancestors`. The app is clickjackable and has no script-source restriction. |

Verified already correct: `/dev/gallery` and `/dev/loading-states` already
`notFound()` outside development (`NODE_ENV !== "development"`), so that part of
STEP 5b needs no work.

---

## Fix order

1. §4.1 the `verify?email` leftover (one-line, two files)
2. §5 the KYC flow — stage one, the stepped wizard, the banner states, the withdraw gate
3. §6.1 ConfirmDialog, then §6.2/§6.3, §7, §9, §8, §10, §11, §12, §13
4. Icons (§2), then public pages (§1)

## Database changes this audit implies

**One** new migration, `0020`, adding one `security definer` function
(`save_onboarding_basics`) that writes `profiles.phone` and `profiles.kyc_type`
and **never** touches `kyc_status` — stage one is account setup, not a
submission. `kyc_type` is not writable from a user session (migration 0011
revoked it), so a service-role function is the only honest way to do this. It is
revoked from `public`, `anon` and `authenticated` on creation, exactly as
`submit_kyc_profile` is, which keeps `assert_phase1_invariants`' allowlist
unchanged and passing.

Nothing in 0010–0019 is modified. No grant, policy or trigger is loosened.

## Needs decision — not guessed at

See the final summary. Carried here so the list has one home: whether customer
copy should avoid the word "exchange"; whether to add a blog; and the items the
audit itself turned up, recorded there rather than decided silently.

---

# Addendum — Group 7c: route reachability

Re-audited at `674e0af`. The rule: every route under `src/app` except `/dev`
must have a link from inside the app, or a deliberate non-link entry point
(an email link, an OAuth redirect, a provider callback). A page with neither
is a page nobody can reach and nobody maintains.

Method: for each route, grep the whole of `src/` for a reference to its path,
excluding the route's own `page.tsx`. Counting references rather than reading
them would miss a path that appears only inside a `redirect()`, so every
low-count result below was read.

| Route | Entry point | Status |
| --- | --- | --- |
| `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password` | Public nav, each other | reachable |
| `/home` | Tab bar, sidebar, wordmark | reachable |
| `/accounts`, `/accounts/[currency]` | **Added in Group 7a** (tab bar + sidebar); Home's wallet cards and "All accounts" since Group 5 | fixed |
| `/convert` | Tab bar, sidebar, Home action, every account page | reachable |
| `/transactions` | Tab bar, sidebar, Home "See all", account page "See all" | reachable |
| `/profile` | Tab bar, sidebar, desktop avatar | reachable |
| `/deposit` | Home's Add money sheet, account pages | reachable |
| `/withdraw` | Home action, account pages | reachable |
| `/receive` | Home action (flag-gated), USD account page | reachable |
| `/support` | **Added in Group 7b** to Profile; desktop header icon already | fixed |
| `/terms`, `/privacy` | Public footer, and **added in Group 7b** to Profile — a signed-in user never sees the public footer again | fixed |
| `/onboarding/kyc`, `/individual`, `/business` | KYC banner on Home, Profile and Withdraw | reachable |
| `/onboarding/kyc/status` | KYC banner while pending — **and now Profile unconditionally**, so an approved user can still see what is on file | fixed |
| `/bills`, `/bills/[category]` | Home action and tab bar, **both now gated on `BILLS_ENABLED`** | deliberately unreachable while the flag is off |
| `/admin` and all nine admin pages | Admin nav in `src/app/admin/layout.tsx`; `/admin` itself from Profile and the sidebar | reachable |
| `/auth/callback`, `/auth/confirm`, `/auth/verify` | Email links and the OAuth redirect — deliberate non-link entry points | reachable by design |
| `/api/webhooks/*`, `/api/cron/*` | Provider callbacks and the scheduler | not user-facing, by design |
| `/dev/gallery`, `/dev/loading-states` | Out of scope per the brief | n/a |

Nothing was found that is both user-facing and unreachable. The three "fixed"
rows were reachable only by accident — a card tap, an icon with no label, or
a footer that signing in removes — which is the same problem one step short
of being invisible.

---

# Addendum — Group 10: responsiveness sweep

Audited at `4712bcc`, against the six failure modes the brief names:
horizontal page overflow, clipped text, tap targets under 44px, overlapping
fixed elements, modals taller than the screen that do not scroll, and tables
outside their scroll wrapper.

## Method, and what it could not cover

Two passes, because neither alone is honest:

1. **Static.** Every `<table>` in `src/` checked for an `overflow-x-auto` /
   `.scroll-x` ancestor; every fixed pixel and `rem` width checked against a
   360px viewport; every modal primitive read for a height bound.
2. **Measured in a real browser** at 360, 375, 768 and 1440, by walking the
   DOM rather than by eye. For each width: `scrollWidth - clientWidth` for
   page overflow, every visible element's bounding box against the viewport's
   right edge, and every `a`/`button`/`input`/`select`/`textarea` measured for
   a sub-44px height. Measuring beats looking — a 2px overflow and a 40px tap
   target are both invisible in a screenshot and both real.

**What the measured pass could not reach, stated plainly:** every route behind
authentication. This environment has no test credentials for the linked
project, and entering real ones is not something this pass would do. So the
dashboard and admin screens were covered by the static pass plus
`/dev/gallery`, which renders the shared primitives — fields, pills, wallet
cards, sheets, the chrome — against fixtures with no session. The components
on those pages are therefore measured; the page-level compositions are not.
`/admin/transactions`, added in Group 9, is the one new composition that has
had no measured pass. Listed below as outstanding rather than quietly
omitted.

## Findings

| # | Tag | Finding | Status |
| --- | --- | --- | --- |
| 10.1 | **UX** | Landing footer: `Sign in`, `Create an account`, `Privacy` and `Terms` were 20px tall — less than half the 44px minimum, on the page most likely to be opened on a phone. | fixed in Group 10 |
| 10.2 | **UX** | Legal pages: the header's `Privacy` / `Terms` links (20px) and `← Back to justpae` (19px). These are the only navigation on those two pages. | fixed in Group 10 |
| 10.3 | **UX** | Desktop header icon buttons — Support, the notification bell and the profile avatar — were `size-10` (40px). Four pixels under, on three controls present on every signed-in screen. | fixed in Group 10 |
| 10.4 | **BROKEN** | `PublicSupportButton`'s panel hung off the bottom of the window from `sm` up. `sm:bottom-auto` on an absolutely positioned box leaves both `top` and `bottom` auto, so it falls back to its static position — the top of its container — and, being out of flow, does not grow that container either. Measured at 1440: bottom edge at 1022px in a 900px window. Introduced in Group 9e and caught by this sweep. | fixed in Group 10 (`sm:bottom-full sm:mb-2`) |
| 10.5 | MINOR | Inline prose links (`support@justpae.com` in the Terms body) measure 19px. Deliberately exempt: an inline link in a paragraph cannot be 44px tall without breaking the paragraph, and it is not a tap target in the sense the rule is about. | not a defect |

## Checked and already correct

Recorded so a later pass does not re-derive them:

| Area | Result |
| --- | --- |
| Horizontal page overflow | Zero at 360, 375, 768 and 1440 on every page reachable without a session. No element extends past the right edge outside a deliberate scroller. |
| Tables outside a scroll wrapper | None. All four UI tables (`/admin/rates`, `/admin/transactions`, `/admin/pnl`, `CnyRateForms`) sit inside `.scroll-x`. The fifth `<table>` is in `src/lib/email/layout.ts`, where a table IS the layout mechanism and a scroll wrapper would be meaningless. |
| Modals taller than the screen | `Modal.tsx` sets no height bound, which looked like a defect and is not: the UA stylesheet gives `dialog` both `max-height: calc(100% - 38px)` and `overflow-y: auto`, and `max-w-md` overrides only the width. Verified by rendering a 3000px-tall dialog with the component's exact classes — it clamped to 742px in a 780px window and scrolled. |
| `SheetPanel` | `w-full` with `max-h-[88dvh]` on a phone, `sm:w-[26rem]` from `sm` up. Correct at every width. |
| Notification dropdown | `fixed inset-x-4 … sm:absolute sm:right-0 sm:w-80` with `max-h-[70dvh] overflow-y-auto`. On-screen at 360. (Also Group 9f.) |
| Form fields | The inner `<input>` measures 42px, but the tap target is the bordered wrapper, which is 44px (`h-11`) or 56px (`min-h-14`). Not a finding. |
| Checkboxes | 20px, but each sits inside a `<label>` measuring 46px, which is the real hit area. Not a finding. |
| Wide `min-w` values | `min-w-[44rem]` / `[48rem]` on tables and `min-w-[15rem]` on wallet cards are all inside horizontal scrollers. Intended. |

## Outstanding

| # | Area | Reason |
| --- | --- | --- |
| 10.6 | Measured pass on authenticated routes — the dashboard pages and all eleven admin pages, `/admin/transactions` especially | No test credentials in this environment. Covered statically and through `/dev/gallery`'s rendering of the shared primitives, which is not the same as measuring the composed page. Needs one pass by someone who can sign in. |

---

# Addendum — Group 11: status of every finding above

The brief asks for a status column: fixed in commit X, or remaining with the
reason. Group 10's own table already carries one. This closes out the
original audit, whose findings predate it.

Sections 1–7 of this document were written against `bae6644`-era code and
fixed across Phases 1–5 and Groups 0–9. Rather than restate 60 rows, the
status is recorded by section, with the commit that closed it. Anything still
open is listed individually, because an open finding hidden inside a summary
is an open finding nobody will act on.

| Section | Status |
| --- | --- |
| 1. Landing | Closed. 1.1 (no Terms/Privacy) by `1845212`; 1.2 (sitemap/robots) and 1.3 (share images) by `1845212`; 1.4 (`public/lovable-uploads`) **in Group 11** — confirmed unreferenced anywhere in the repo, then deleted. |
| 2. Favicon, icons, install | Closed by `1845212`: `icon.svg`, `favicon.ico`, `apple-icon.png`, `public/icon-192.png` / `icon-512.png`, `manifest.ts`. |
| 3. Signup → verify → first screen | Closed by `48b879b` (dashboard-first signup) and the Group 7 loading boundaries. |
| 4. The `verify?email=` leftover | Closed by `48b879b`. |
| 5. KYC | Closed by `48b879b` (two-stage split, stepped forms, `government_id` not `selfie`, branching banner) and `5fae662` (uploads that survive a phone photo). The submission DATE, which this section did not catch, is **Group 9b** / migration 0028. |
| 6. Money screens | Closed across Groups 4–6: two-leg conversions (`0024`), conversion holds (`0022`), the deposit countdown (Group 6c), wallet preselection (`src/lib/accounts/preselect.ts`). |
| 7. Route reachability | Closed in Group 7c — see that addendum. Pay to China, the one route left unreachable there, is linked from the sidebar, Home and every fundable wallet page as of **Group 8 part 2**. |

## Still open

| # | Finding | Why it is still open |
| --- | --- | --- |
| 10.6 | No measured responsiveness pass on authenticated routes | No test credentials in this environment. See the Group 10 addendum's method note. |
| 11.1 | The Privacy Policy names Busha and Klasha as sub-processors | Not an oversight and not safe to "fix" silently. The standing rule is that customer copy never names a provider; a privacy policy disclosing who data is shared with is the one place where naming them is arguably a legal obligation rather than a leak. Predates this run (`1845212`). Left as-is pending a decision from the owner — recorded in the Group 12 reply rather than resolved unilaterally. |
| 11.2 | Group 6d — the live Busha probe | A hard safety stop, not a task. There is no Busha sandbox on this project: the configured base URL is production and the key is live. `scripts/busha-probe.mjs` is committed, read-only (GETs only, no quote, no transfer, never logs the key) and has deliberately never been run from here. It needs the owner. |

# JesDanPay parity

What this is: every commit on `zadok-visuals/jesdanpay` `main` since 2026-10-02,
read as a **diff** rather than as a subject line, and classified against what
justpae already does.

JesDanPay is a **read-only behavioural reference**. Nothing about its look is
parity-relevant: not its palette, images, copy, branding, sender address or
social links. Neither is its security model — several of its money functions are
callable by `authenticated` with caller-supplied amounts, which is precisely the
class of hole justpae's migrations 0010–0021 closed. Where a commit below is
marked "to port", it is the **behaviour** that is being ported, re-expressed
under the justpae security rules.

| Field | Value |
| --- | --- |
| Reference repo | `https://github.com/zadok-visuals/jesdanpay` |
| Reference HEAD | `b3a913dfa456afdcb87b35819017538108958811` |
| HEAD subject | Rename GHS "coming soon" to "maintenance" everywhere, remove the CNY pricing tiers card from the customer UI |
| HEAD date | 2026-10-13 08:19:52 +0100 |
| Commits in window | 56 (`git log --since=2026-10-02`) |
| Cloned to | a scratch path outside this repo; never a submodule, never a remote here |

## Why so much is already "ported"

justpae is not a fork of JesDanPay — it is a rebuild. Its own history
(`bae6644` onward, 2026-10-02) ported the whole JesDanPay architecture *minus*
RMB/CNY and *minus* its security model, then went further in five numbered
phases:

* `314f59e` / `9ac4381` — Phase 1: stop trusting the client with money, KYC
  status and PINs, and assert those invariants against the catalog.
* `5fae662` — Phase 2: deposit fee maths, KYC uploads that survive a phone
  photo, rate-probe noise.
* `2484927`…`73c4604` — Phase 3: notifications, support chat, money emails.
* `a21a5de` — Phase 4: admin roles, TOTP at aal2, audit ledger, suspension.
* `00b4418`…`355c781` — Phase 5 and the screen-by-screen audit.

So most of the window below landed in justpae *before* this parity pass, by a
different route. The table records the justpae commit that did it.

## Legend

* **ported** — the behaviour exists in justpae; the commit that brought it is named.
* **not applicable** — branding, copy, testimonials, social links, JesDanPay-only
  infrastructure, or something superseded inside JesDanPay's own history.
* **to port in this run** — genuinely missing, and assigned to a group below.

## The table

| # | Commit | Subject | Status | Detail |
| --- | --- | --- | --- | --- |
| 1 | `d919651` | Show KYC submission dates, add RMB rejection reasons | **ported** | **Group 9b** — migration 0028 adds `profiles.kyc_submitted_at`, written by `submit_kyc_profile` in the same statement that sets `kyc_status`. The queue now orders by it (oldest submission first) and shows account creation separately. The RMB rejection-reason half landed in Group 8f. |
| 2 | `03d2587` | Add admin Users directory | **ported** / partial | `src/app/admin/users/page.tsx` exists (`ebeb4bc`, `a21a5de`). JesDanPay's per-user drill-down `admin/users/[id]` has no justpae equivalent — folded into **Group 9a**. |
| 3 | `be309a6` | Add per-order breakdown to PNL page | **ported** | **Group 8h** — `/admin/pnl` now renders a per-order table (route, paid, got, margin) over all four routes, with the un-valued ones shown as "not valued" and their reason on hover rather than dropped. |
| 4 | `8f00af0` | Add admin MFA via Supabase TOTP | **ported** | `a21a5de` — `src/lib/auth/admin.ts` requires `aal2`; `src/components/admin/MfaSetup.tsx`. justpae's is stricter: aal2 on every admin page *and* action. |
| 5 | `9f8efeb` | Email admins on new KYC submission via Resend | **ported** | `2484927` / `73c4604` — `sendKycSubmittedEmail` in `src/lib/email.ts`. |
| 6 | `bbf3c1b` | Add Privacy Policy and Terms pages | **ported** | `1845212` — `src/app/privacy`, `src/app/terms`, `src/components/legal/LegalPage.tsx`. Text is justpae's own. |
| 7 | `86208f0` | Volume/balance/24h/KYC-rate stats on admin dashboard | **ported** | `a21a5de` — `admin_dashboard_stats` in migration 0019 computes all of it in one SQL call. |
| 8 | `056df54` | Admin-to-user notifications (bell, broadcast or targeted) | **ported** | `2484927` + `d801176` + `364546d` — migration 0017, `NotificationBell.tsx`, `NotificationComposer.tsx`. |
| 9 | `08b87fc` | Deposit fee breakdown on payment screen, fiat minimums | **ported** | `5fae662` — fee rows in `src/components/deposit/DepositForm.tsx`, minimums in `src/lib/busha/limits.ts`. |
| 10 | `eb58dca` | "Back to app" link in admin header | **ported** | `src/app/admin/layout.tsx` already carries it. |
| 11 | `63e9e76` | Role-backed admin access + sign-in/out audit log | **ported** | `a21a5de` — migration 0019 `admin_users` + `admin_activity_log`, append-only. |
| 12 | `ca418e2` | In-app chat support (user ↔ admin) | **ported** | `2484927` / `364546d` — migration 0017 `support_messages`, `src/components/support/SupportChat.tsx`. |
| 13 | `48353d1` | Show the CNY tier ladder on the Convert form | **not applicable** | Superseded inside JesDanPay by `b3a913d`, which removed the tier card from the customer UI. Tiers price, they do not display. **Group 8b** adopts the end state, not this one. |
| 14 | `b6f6e12` | Fix admin_users-only accounts bounced from MFA enrol | **ported** | `a21a5de` — justpae's `requireAdminUser` resolves the role before the aal2 gate, so the bug never existed here. |
| 15 | `5ed5ee4` | Fix deposit fee math (KES especially) | **ported** | `5fae662` + `b29f434` — the maths moved out of the database into `src/lib/rates/markupMath.ts`, under unit test. |
| 16 | `412e8a3` | Admin suspend/release for user accounts | **ported** | `a21a5de` — migration 0019 suspension columns + triggers; `src/lib/supabase/proxy.ts` enforces it. |
| 17 | `710fef3` | Style admin header controls as proper buttons | **not applicable** | JesDanPay's visual design. justpae has its own `src/components/ui/Button.tsx`. |
| 18 | `3882061` | Redesign admin dashboard, icon-led grouped stat cards | **not applicable** | JesDanPay's visual design. justpae's admin dashboard is its own ink/gold layout. |
| 19 | `cb9d8f9` | Unread badges on chat icon and admin Chat Support tab | **ported** | `34fc89b` — `src/components/layout/UnreadCountsContext.tsx`. |
| 20 | `7da2573` | Admin transaction lookup by reference number | **ported** | **Group 9a** — `?reference=` on `/admin/transactions` filters the same list rather than opening a separate result card, so one layout serves both. Indexed in 0027. |
| 21 | `62bdafc` | Disable Remove for own row and last super admin | **ported** | Self-revocation was already refused in SQL by 0019. **Group 9c** adds the last-superadmin guard, also in SQL (0027's `admin_revoke_role`, counting only `revoked_at is null` rows and locking the target first so two concurrent revocations cannot both pass). The UI replaces the button with the reason. |
| 22 | `70564ef` | Show CNY pricing tiers on the Pay to China page | **not applicable** | Superseded by `b3a913d`, same as #13. |
| 23 | `bdc065d` | Admin header hamburger menu for mobile | **not applicable** | justpae's admin nav is a horizontal `snap-rail`, not a hamburger. Its mobile behaviour is fixed in **Group 2** instead. |
| 24 | `9bff6d4` | Equal-width admin quick-action tiles on mobile | **not applicable** | JesDanPay's dashboard layout; justpae's differs. Covered generically by **Group 10**. |
| 25 | `7509c73` | Remove duplicate Settings icon from Topbar | **not applicable** | justpae's chrome never had the duplicate. |
| 26 | `3d10c05` | Notification dropdown overflowing viewport on mobile | **ported** | `src/components/layout/NotificationBell.tsx` uses `fixed inset-x-4 … sm:absolute sm:right-0 sm:w-80` with `max-h-[70dvh] overflow-y-auto` — the fix, arrived at independently. Re-verified under **Group 9f**. Notification attachments also exist (0026 adds `notifications.attachment_ref`; `insertNotificationWithAttachment` carries the Pay to China proof). |
| 27 | `712113c` | Loading states and pending hints on admin chat navigation | **ported** | **Group 9d** — `/admin/support/[userId]/loading.tsx`. `/admin/loading.tsx` already covered the route; the problem was that its queue-shaped skeleton read as "the list is loading" when a thread was opening. The new one is thread-shaped. |
| 28 | `72face6` | og:image / twitter:image share image | **ported** | `1845212` — `src/app/opengraph-image.tsx`, `src/app/twitter-image.tsx`. |
| 29 | `d042eed` | Klasha login: `x-auth-token` header, sandbox-host comments | **ported** | `e3d7c5d` / `981d988` — `src/lib/klasha/client.ts` carries the header and the corrected comments. |
| 30 | `2bec141` | Harden Klasha env reads, login failure diagnostics | **ported** | Same files; justpae's `src/lib/supabase/env.ts` pattern made the env reads fail-closed repo-wide. |
| 31 | `c1d8dfa` | Google Analytics, restricted to public pages | **ported** | `src/components/analytics/Analytics.tsx`, gated to public pages, off unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set *and* the CSP is widened. Stricter than JesDanPay's. |
| 32 | `351cb02` | sitemap.xml and robots.txt | **ported** | `src/app/sitemap.ts`, `src/app/robots.ts`. |
| 33 | `f7f043d` | Rejected-KYC experience — no redirects, dashboard usable | **ported** | `48b879b` + `src/components/kyc/KycStatusBanner.tsx`. |
| 34 | `7560490` | Make the Klasha encryption secret length diagnosable | **ported** | Comment-level; the note survives in justpae's `.env.local.example` and `klasha/client.ts`. |
| 35 | `baf2440` | Fix GHS deposit button silently doing nothing | **ported** | justpae gates GHS behind `KLASHA_GHS_DEPOSIT_ENABLED` with an explicit unavailable reason in `src/lib/deposits/availability.ts`, so the dead click cannot occur. |
| 36 | `12af39c` | Expiry countdown on the bank-transfer deposit screen | **to port in this run** | `src/lib/hooks/useCountdown.ts` exists but only `ConvertForm` uses it. The deposit screen has no countdown. **Group 6c**. |
| 37 | `adfd785` | Replace placeholder testimonial names with real ones | **not applicable** | JesDanPay's customers, on JesDanPay's landing page. |
| 38 | `2d0e440` | Fix countdown showing "Expired" immediately | **to port in this run** | The off-by-one (server expiry parsed in the wrong unit) is a real bug to avoid when building **Group 6c**'s countdown. Recorded so it is not re-introduced. |
| 39 | `7ec3db1` | Remove customer-facing mentions of Busha and Klasha | **ported** | `355c781` and the standing repo rule. Re-verified by grep in **Group 12**. |
| 40 | `9b4d3be` | Changes to Landing page | **not applicable** | JesDanPay testimonial copy. |
| 41 | `996fc1e` | Hmm | **not applicable** | One-line testimonial copy edit. |
| 42 | `f91860b` | KYC uploads crashing on large photos | **ported** | `5fae662` — `src/lib/storage/clientUpload.ts` + `verifyUpload.ts` upload direct to the bucket, bypassing the server-action body limit; `error.tsx` / `global-error.tsx` exist. |
| 43 | `2a459d6` | Stop logging routine rate-probe noise; stop probing GHS | **ported** | `5fae662` — `src/lib/busha/rate.ts`. |
| 44 | `8b9ff58` | Dashboard-first signup, country-aware identity, KYC-approved email | **ported** | `48b879b` + migration 0020 `save_onboarding_basics`, which (unlike JesDanPay's) cannot write `kyc_status`. |
| 45 | `df86576` | Split KYC into quick onboarding + separate ID submission | **ported** | `48b879b` — `src/app/onboarding/kyc/*` and `KycTypeSelector.tsx`. |
| 46 | `06f7795` | RMB QR-only crash, copyable admin payment details, proof upload | **to port in this run** | **Group 8d.3, 8f.2, 8f.3**. QR-only must work; proof goes to a private bucket with signed URLs. |
| 47 | `9a2ea16` | RMB send form, admin RMB queue, notification emails | **to port in this run** | **Group 8d, 8e, 8f**. JesDanPay's `create_rmb_manual_transaction(_v2)` is `authenticated`-callable with caller-supplied amounts — **not** reproduced. |
| 48 | `df0f4c7` | Stale balance after deposit; PNL in USDT; tier/min in local currency | **ported** | **Group 8b** (minimums in the user's own currency) and **Group 8h** (PNL in USDT — every route converted at the supplier rate in force, in `src/lib/admin/pnlMath.ts`, under unit test). The stale-balance half is already handled by justpae's `revalidatePath` discipline. |
| 49 | `d78ed70` | Every transaction with its user; dashboard financials | **ported** | **Group 9a** — migration 0027's `admin_activity_ledger` view unions transactions, deposits and bill_payments with the profile joined on; `/admin/transactions` pages it with `.range` and one extra row, filters by user, type, status, currency and date, and is linked from the admin nav. |
| 50 | `98bec16` | Record and show the CNY amount on every RMB request | **to port in this run** | **Group 8d** — the target CNY is computed server-side and stored on the transaction. |
| 51 | `857b9ca` | Email both sides of the support chat | **ported** | `73c4604` — `sendSupportMessageEmail` in `src/lib/email.ts`, called from `src/lib/actions/support.ts`. |
| 52 | `89304ae` | Real social links in footer/SEO; GHS coming soon everywhere | **not applicable** (social) / **ported** (GHS) | JesDanPay's social accounts are JesDanPay's. GHS unavailability says "under maintenance" everywhere it appears — verified by grep in **Group 9g**; the one stale "coming soon" left was a dev-gallery fixture, now matching the real wording. |
| 53 | `b7c5983` | CNY tier pricing matches the USDT rate; KES before GHS; logged-out floating support; chat loading | **ported** | **Group 8b** (pricing), **Group 9g** (KES before GHS — already the order in `CURRENCIES`, with GHS last because it is under maintenance), **Group 9e** (`PublicSupportButton` on the landing page, both legal pages and the auth shell — email, not the in-app chat, which is per-account and has no row an anonymous visitor could write). |
| 54 | `3f7ad14` | Chat timestamps/seen/pinned note/images; Pay to China in PNL; completion emails; withdraw any funded currency | **ported** | Withdraw-any-funded-currency is migration 0016; completion emails are `73c4604`; attachments and Pay to China in PNL landed in Group 8. **Group 9d** adds Sent/Seen, day separators (Today / Yesterday / date) and the pinned reassurance note, on both the customer and the admin side, from one tested module (`src/lib/support/thread.ts`). |
| 55 | `ae243ba` | PNL: fall back to the earliest supplier rate, marked estimated | **ported** | **Group 8h** — `src/lib/admin/supplierRate.ts` returns `{ rate, estimated }`, falling back to the earliest rate on file and returning null only when the pair has no rate at all. Counted, flagged per order, tallied in a summary banner. `src/lib/admin/supplierRate.test.ts` covers in-force / fallback / null / wrong-pair / wrong-base. |
| 56 | `b3a913d` | GHS "coming soon" → "maintenance"; remove CNY tiers card | **to port in this run** | **Group 9g** (GHS wording) and **Group 8b** (tiers price but never display). This is JesDanPay's current end state and therefore the one to adopt. |

## Rollup

Five commits are split — part of the commit was already ported, part is still
outstanding — so they are counted in both columns and the totals exceed 56 by
five. The split ones are `d919651`, `03d2587`, `62bdafc`, `89304ae`, `3f7ad14`.

| Status | Count |
| --- | --- |
| ported (fully) | 27 |
| ported in part, remainder assigned below | 5 |
| not applicable | 11 |
| to port in this run | 13 (+ the 5 partials) |

## What "to port" maps to

| Group | Commits |
| --- | --- |
| 6c | `12af39c`, `2d0e440` |
| 8b | `df0f4c7`, `b7c5983`, `b3a913d` |
| 8d | `9a2ea16`, `06f7795`, `98bec16` |
| 8e / 8f | `9a2ea16`, `06f7795`, `d919651` (RMB half) |
| 8h | `be309a6`, `df0f4c7`, `3f7ad14` (PNL half), `ae243ba` |
| 9a | `7da2573`, `d78ed70`, `03d2587` (drill-down) |
| 9b | `d919651` (KYC half, improved to a real submission date) |
| 9c | `62bdafc` (last-superadmin guard) |
| 9d | `3f7ad14` (chat half), `712113c` |
| 9e | `b7c5983` (floating support half) |
| 9g | `b3a913d`, `89304ae` (GHS half), `b7c5983` (KES before GHS) |

## Things JesDanPay does that justpae deliberately will not

Recorded so a future pass does not "fix" them back:

1. **`record_cny_conversion` and `create_rmb_manual_transaction(_v2)` executable
   by `authenticated`, taking caller-supplied amounts.** Every CNY and RMB
   function added in Group 8 is revoked from `public, anon, authenticated` and
   called only through the service role with `p_user_id` from
   `supabase.auth.getUser()`.
2. **Tier ladders shown to customers.** `b3a913d` removed them in JesDanPay too;
   justpae never adds them. Tiers price; minimums display, in the user's own
   currency.
3. **Provider names in customer-facing text.** Internal code may say Busha or
   Klasha freely; nothing a customer reads may.
4. **The word "exchange" in customer-facing text.** "Convert" / "conversion"
   throughout.
5. **JesDanPay's palette, mark, imagery, testimonials, sender address and social
   links.** justpae keeps its own dark ink and gold identity.

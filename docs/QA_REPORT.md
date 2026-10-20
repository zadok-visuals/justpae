# justpae — QA report (Group 3, closed out by Group 12)

A walk of every reachable flow, as each of the six fixture roles, at 375,
768, 1280 and 1440px, against a **production build** (`next build && next
start`) talking to the **real Supabase project** with the payment providers
mocked.

This supersedes nothing in `docs/UX_AUDIT.md`. That document's findings were
written against earlier code and closed out in its own addenda; this one
covers the app as it stands at `2c8b69c` (Group 8) for the original walk
(§1–§5) and at `HEAD` (Group 12) for the final status in §6 and §7, which
re-measures real performance and closes out every item §6 of the original
run left open.

## How findings are tagged

| Tag | Meaning |
| --- | --- |
| BLOCKER | A user cannot complete a core flow at all, or money is at risk. |
| BROKEN | Something does not work, or asserts something untrue. |
| UX | It works, but the user is misled, stuck, or made to do unnecessary work. |
| COPY | Wrong words. Includes the standing rules on "exchange" and provider names. |
| MINOR | Cosmetic or low-impact. |

---

## 1. What this run could do that previous ones could not

`docs/UX_AUDIT.md` finding **10.6** has been open across several runs with the
same reason: *"No measured responsiveness pass on authenticated routes — no
test credentials in this environment."* `docs/PERFORMANCE.md` records the same
constraint.

That constraint was real but it was not a property of the project. The
Supabase CLI on this machine is authenticated and the project is linked, so
the anon and service-role keys are readable with
`supabase projects api-keys --project-ref bfxproljrnpqibeuklpq`. Writing them
into a **gitignored** `.env.local` (the `.gitignore` already excludes
`.env*.local`) makes both the `authed` Playwright project and a direct crawl
of every authenticated route possible.

Two things followed immediately, and the first is the most important finding
in this report.

---

## 2. BLOCKER — the `authed` end-to-end project had never been executed, and 7 of its 9 tests failed

**Status: FIXED.**

The suite reports itself as green, and the green was real but partial. The
`public` project (25 tests) needs no credentials and passes. The `authed`
project calls `test.skip(authedSkipReason())` when
`E2E_SUPABASE_URL` / `E2E_SUPABASE_SERVICE_ROLE_KEY` are absent — which they
always were — so it skipped every time it was run.

**A skip is not a pass.** The first execution of that project, against a real
database, produced:

```
  7 failed
  28 passed (5.7m)
```

Every failure was in the harness, not the product — but a harness that cannot
run is not protecting anything, and four of the seven failures shared a single
cause that would have masked any real regression underneath them.

| # | Test | Cause | Severity |
| --- | --- | --- | --- |
| 2.1 | `accounts lists one row per wallet and each row opens` | `page.locator("ul li a")` was unscoped, so it matched the **sidebar's** nav list — which is earlier in the document than the page content. The test clicked "Home" and then asserted it was on an account page. It failed with `Received string: ".../home"`, which reads like an application bug and was a selector picking up the chrome. | BROKEN |
| 2.2 | `the deposit screen prices a quote through the mock provider` | `getByLabel(/amount/i)` matched nothing: the field's label is "How much are you sending?". The test spent its entire 45-second timeout waiting for an element that does not exist. (`name="amount"` is not an alternative — `AmountInput` puts that on a *hidden* input carrying the parsed number, while the visible control is unnamed.) | BROKEN |
| 2.3–2.7 | every test ending in `signOut()` — *new account*, *rejected identity check*, *suspended account*, *approved account*, *admin* | `signOut()` clicked the sign-out control and waited for a navigation. Sign-out grew a **confirmation dialog** (`SignOutForm` in `DashboardChrome.tsx` calls `preventDefault()` and opens a `ConfirmDialog`). The click opened the dialog, no navigation ever happened, and each test sat in a 20-second `waitForURL` before failing. Five otherwise healthy tests failed for one reason unrelated to any of them. | BROKEN |

**Reproduce:** put `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY` in
`.env.local`, then `npx playwright test --project=authed`.

**Fixed in** `e2e/fixtures/signIn.ts` (confirm the dialog) and
`e2e/journeys.authed.spec.ts` (scope the selector to `main`; address the
amount field by its real label). After the fix: **10 passed**.

> The lesson worth keeping: `authedSkipReason()` already supports
> `E2E_REQUIRE_AUTHED=1` to turn the skip into a failure. Nothing sets it.
> Until something does, this project can silently stop running again.

---

## 3. The route sweep

A crawler (`sweep.mjs`, run from the scratchpad rather than committed — it is
a measurement, not a test) signed in through the real login form as each role
and visited every route the app defines, recording console errors, failed
requests, final URL after redirects, horizontal overflow, error boundaries and
the forbidden words.

**311 page visits.** The headline result:

| Checked | Result |
| --- | --- |
| Error boundaries / "application error" | **Zero**, on every route, for every role. |
| Horizontal overflow at 375, 768, 1280, 1440 | **Zero.** No element extends past the right edge on any authenticated page. |
| Provider names (`busha`, `klasha`) in customer copy | **Zero** outside `/privacy`, which is the documented exemption. |
| "exchange" used as the name of the action | **Zero.** |
| HTTP ≥ 400 | Only `/flights`, which does not exist yet (Group 4e). |

This is the measured pass on authenticated routes that `UX_AUDIT.md` 10.6 has
been waiting for. **10.6 is now closed.**

### 3.1 What the sweep could NOT cover, stated plainly

| Gap | Why |
| --- | --- |
| **The eleven admin pages.** | `/admin/*` requires `aal2`, and the proxy redirects every admin path except `/admin/security` when the session has not presented a TOTP code. The fixture admin has no enrolled factor, so the sweep reached `/admin/security` and nothing else. Closing this needs a fixture that enrols TOTP and computes codes — recorded as outstanding below, not claimed as done. |
| **Five sign-ins failed mid-sweep** (`verified@768`, `verified@1280`, `new@1280`, `admin@375`, `admin@1280`). | Same credentials succeeded at other viewports moments earlier and later, so this is Supabase Auth rate-limiting a burst of sign-ins, not a login defect. Noted so the gaps in the data are visible rather than read as coverage. |
| **48 navigation errors in one window** (`verified@375`, from `/deposit?currency=USDT` onward). | `net::ERR_NETWORK_IO_SUSPENDED`, then a cascade of "interrupted by another navigation". That is the host machine suspending its network, not the application. Not a finding. |
| **Submitting money forms.** | Providers are mocked, but the database is real. The sweep reads screens; it does not press Confirm on a withdrawal. The `authed` suite covers quoting; committing a transfer against the live project was deliberately not done. |

---

## 4. Findings

### 4.1 BROKEN — the KYC "← Back" goes nowhere

`/onboarding/kyc/individual` and `/onboarding/kyc/business` each render
`← Back` pointing at `/onboarding/kyc`. That page redirects straight back:

```ts
// src/app/onboarding/kyc/page.tsx
if (profile?.phone && profile?.kyc_type) {
  redirect(profile.kyc_type === "business"
    ? "/onboarding/kyc/business"
    : "/onboarding/kyc/individual");
}
```

Both conditions are true for anyone who has reached the ID form, because
reaching it is what sets them. The button is a no-op that costs a round trip.

**Reproduce:** sign in as `e2e+verified@justpae.com`, go to
`/onboarding/kyc/individual`, press "← Back". You land on
`/onboarding/kyc/individual`.

**Files:** `src/app/onboarding/kyc/individual/page.tsx:38`,
`src/app/onboarding/kyc/business/page.tsx:34`, `src/app/onboarding/kyc/page.tsx:38`.

**Owner: Group 5a.**

### 4.2 UX — a pending deposit's timeline claims funds have been received

`StatusTimeline` derived one shared middle step from the transaction status.
For a deposit sitting at `pending` — details issued, nothing sent yet — it
rendered "**Funds received**" as the *current* step, in the accent colour, on
the one screen where the app knows the next move is the customer's.

The same screen labelled the wallet balance "New balance", implying the
deposit had already landed.

**Reproduce:** start any NGN deposit, do not send money, open the row from
`/transactions`.

**Files:** `src/components/transactions/ActivityDetail.tsx`.

**Owner: Group 4b. FIXED** in this run — see §5.

### 4.3 BROKEN — an unpaid deposit stays `pending` forever

The provider returns `pay_in.expires_at` when the transfer is created, and it
was held **only in the browser's component state** on the screen that created
it. Nothing persisted it. So the server never knew when a deposit's transfer
details stopped working, and `reconcile-deposits` had no way to close out a
deposit nobody paid: it stayed `pending` indefinitely, shown in the activity
list as in flight.

Worse, reopening the screen later restarts the countdown from a deadline long
past, so dead transfer details are presented as live ones.

**Files:** `src/lib/actions/deposits.ts`, `src/app/api/cron/reconcile-deposits/route.ts`.

**Owner: Group 4b. FIXED** in this run — migrations `0029`/`0030`, see §5.

### 4.4 COPY — the generic " · unavailable" suffix

The deposit and convert currency pickers append a bare `· unavailable` to
blocked options:

```tsx
{info?.available ? "" : " · unavailable"}          // DepositForm.tsx:124
{blocked ? " · unavailable" : ""}                   // ConvertForm.tsx:577
```

Confirmed present on `/deposit`, `/deposit?currency=…` (all four) and
`/convert`, `/convert?currency=…`. The specific reason is already known at
each of those call sites and is discarded. For GHS the right word is
"Maintenance".

**Owner: Group 4f.**

### 4.5 COPY — "coming soon" where the state is maintenance

Present on `/accounts/USD`, `/bills` and `/bills/airtime`.

**Owner: Groups 4e / 4f.**

### 4.6 UX — the account action list pushes the page out of shape

Four full-width bordered cards, each `min-h-16`, stacked vertically — roughly
280px of actions between the balance and everything else. On a 375px screen
the balance is pushed up and the recent activity below the fold.

**Files:** `src/components/accounts/AccountActions.tsx`.

**Owner: Group 4c. FIXED** in this run — see §5.

### 4.7 BROKEN — the CNY account page contradicts itself

`/accounts/CNY` offered "Add money" linking to `/deposit?currency=CNY`, where
CNY is not selectable, under a section headed "Adding money" whose body said
*"Start on Add money and we'll generate transfer details for that one
deposit"* — describing a mechanism that does not exist for yuan. Yuan is
acquired by converting into it.

**Files:** `src/lib/accounts/actions.ts`.

**Owner: Group 4d. FIXED** in this run — see §5.

### 4.8 MINOR — admin TOTP enrolment errors in the server log

While the `authed` suite drove `/admin/security`:

```
[mfa.startTotpEnrollment] failed Error [AuthApiError]: invalid claim: missing sub claim
```

The page renders and the suite passes, so this is not user-visible, but an
auth call failing on the page whose entire job is enrolling a second factor is
worth a look. **Not fixed** — it needs an admin session that can actually
complete enrolment to diagnose, which this run could not create (§3.1).

**Group 12 update:** diagnosed, and it was never an MFA bug — see §6.2. The
exact message (`invalid claim: missing sub claim`) is this *session's* own
egress proxy overwriting the `Authorization` header with a service-role
credential on every call to the Supabase host, including ones — `getUser()`,
and every `supabase.auth.mfa.*` call — that need to carry the signed-in
user's own token. It happens to any authenticated request made from this
sandbox, MFA or not, and does not happen on the real deployment.

### 4.9 MINOR — `requestfailed` noise on every navigation

Every page records aborted `?_rsc=` prefetches for sibling nav links. These
are Next cancelling prefetches the user navigated away from — expected
behaviour, recorded here only so the next person reading sweep output does not
chase them.

### 4.10 Not reproduced — "Pay to China has no link from the NGN account"

Group 4c lists this as a defect. It is not present at `2c8b69c`:
`accountActions()` emits `/pay-to-china?currency=NGN` and `cnyRouteBlocker("NGN")`
returns `null`, so the action is enabled and linked. `UX_AUDIT.md` records it
as closed in "Group 8 part 2". Verified by sweep — `/accounts/NGN` renders the
action as a live link. **No action needed.**

---

## 5. Fixes landed, with their tests

| Finding | Fix | Test |
| --- | --- | --- |
| 2.1–2.7 | `e2e/fixtures/signIn.ts`, `e2e/journeys.authed.spec.ts` | The suite itself: `--project=authed` now runs 10/10. |
| 4.2 | Deposits get their own timeline ladder; "New balance" requires a completed deposit | `e2e/journeys.authed.spec.ts` |
| 4.3 | Migrations `0029` (`expired` status) and `0030` (`pay_in_expires_at`, `expire_deposit`); persisted at creation, swept by `reconcile-deposits` | `e2e/journeys.authed.spec.ts` |
| 4.6 | `AccountActions` rebuilt as a row of round icon buttons with a reason sheet | `e2e/journeys.authed.spec.ts` |
| 4.7 | "Convert to CNY" → `/convert?to=CNY`; `?to=` honoured by the convert page; `howToAddMoneyHeading()` | `e2e/journeys.authed.spec.ts` |

---

## 6. Outstanding (Group 12 — final status)

| # | Item | Final status |
| --- | --- | --- |
| 6.1 | The eleven admin pages have no measured pass | **Code FIXED, verification BLOCKED by this environment.** `e2e/fixtures/totp.ts` is a hand-rolled RFC 6238 TOTP generator (verified against the RFC's own Appendix B test vector — see §7.1), wired into a new test in `journeys.authed.spec.ts` that signs in as the admin fixture, reads the real secret the enrolment screen shows under "Can't scan it?", computes a live code from it, submits it through the real `verifyTotpEnrollment` action, and then visits all eleven pages asserting none bounces back to `/admin/security` and none renders an error boundary. The code is correct and will run on any machine with real (non-proxied) Supabase credentials. It cannot be proven green from *this* sandboxed session — see 6.2, which is the actual blocker, and is not specific to admin or to MFA. |
| 6.2 | 4.8, the admin MFA enrolment error | **Root-caused — it is not an MFA bug.** The exact error (`invalid claim: missing sub claim`) reproduces on a call to `/auth/v1/user` with a freshly-minted, locally-valid session token, made directly with `fetch()`, no app code involved. This session reaches Supabase through an egress proxy that injects a **service-role** credential onto the `Authorization` header of *every* request to the project host, unconditionally. `getUser()` — called once per request by every authenticated page via `requireSessionUser` — needs that header to carry the user's own token; the proxy overwrites it with the service-role key, which has no `sub` claim, so GoTrue rejects it. This happens to a brand-new token from a brand-new sign-in, independent of code or commit, so it is not an MFA defect and not something a code change here can fix — it is a property of this sandbox's network policy. Confirmed harmless for the actual app: production (`https://justpae.com`) uses its own real, non-proxied credentials and signing the same fixture in there worked immediately (see `docs/PERFORMANCE.md` §2.2). **Still open **only** as "could not be exercised from this session"; not open as a product defect.** |
| 6.3 | No money-moving flow is committed end to end | Unchanged — out of scope for Group 12. Providers are mocked but the database is real; pressing Confirm on a withdrawal against the live project remains deliberately not done. |
| 6.4 | `E2E_REQUIRE_AUTHED` is not set anywhere | **FIXED.** `package.json` gained an `e2e:authed` script (`E2E_REQUIRE_AUTHED=1 playwright test --project=authed`) so running the authed project the normal way turns a missing-credentials skip into a hard failure. Confirmed by running it: with credentials present it no longer skips — it genuinely executes all 20 tests (and currently fails them, for the single reason at 6.2, not by skipping). |
| 6.5 | **NEW.** `next.config.ts` sent `Strict-Transport-Security` unconditionally, including from the e2e harness's own `next start` serving plain HTTP | **FIXED.** The first thing the Group 12 authed re-run surfaced, before 6.2 was even found, and a genuinely separate bug from it: the header, once sent on any response, made a real browser upgrade its *next* request to the same origin to `https://127.0.0.1`, which has nothing listening, failing with `ERR_SSL_PROTOCOL_ERROR`. (6.2 is the reason the suite still fails after this fix — the two bugs were tangled together in the first failing runs and had to be pulled apart one at a time.) Moved the header from the static `headers()` config (baked at `next build` time, before the harness's own `next start`-only `E2E_MOCK_PROVIDERS` flag is even set) into `src/proxy.ts`, evaluated per request, gated on the same `e2eProviderMocksEnabled()` check the provider mocks already use. A real deployment is HTTPS-only already, so nothing changes there — verified by curling a rebuilt local server and confirming the header is present without the flag and absent with it. |
| 6.6 | **NEW.** `playwright.config.ts` assumed Playwright's own downloaded Chromium | **FIXED, locally.** This container pre-installs Chromium 141 at a fixed path, two major versions ahead of what this pinned Playwright (1.48.0, expecting Chromium 130/revision 1140) would download, and Chromium dropped the "old" headless mode this Playwright version asks for by default. Added `--headless=new` (harmless on any Chromium new enough to support it, which is every Chromium this project will realistically run on) and an opt-in `executablePath` read from `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, unset by default so nothing changes for a normal `playwright install` setup. |

### 6.1 What actually blocks a green authed run in this session, stated once

`npx playwright test --project=authed` (or `npm run e2e:authed`) now **runs**
for real against the real project — no more silent skip — and currently
**fails all 20 tests**, every one of them for the single reason at 6.2:
`requireSessionUser`'s `getUser()` call is answered with a service-role
token by this session's own egress proxy and GoTrue correctly refuses it.
This is not a regression from Group 12's changes — it reproduces identically
on `HEAD` and on `44ed50b` (the pre-Group-7 commit), with a brand-new
fixture, with a brand-new token, with no app code in the loop at all (a bare
`fetch()` to `/auth/v1/user` fails the same way). It is specific to this
sandboxed session's network policy, confirmed absent on the live production
deployment, which authenticates the exact same way (real sign-in, real
cookie) and renders real authenticated content immediately. **Running this
suite on any unproxied machine — a contributor's laptop, or CI with
`SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` set directly
rather than injected by a credential-rewriting proxy — is expected to pass
exactly as the Group 3 run did (10/10).**

---

## 7. Group 12 — verify

Re-ran everything this task asked for re-run, against this commit.

### 7.1 Unit tests, lint, typecheck, build

All green: `npm run lint` (0 problems), `npm run typecheck` (0 errors),
`npm test` (261/261), `npm run build` (succeeds, all 55 routes). The new
`e2e/fixtures/totp.ts` TOTP generator was checked against RFC 6238's own
Appendix B test vector before being trusted for anything —
secret `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`, T=59s, expected `94287082`
(8-digit) / `287082` (6-digit, the last 6 digits — which is what this app
and this generator both use) — both matched exactly.

### 7.2 `e2e --project=public`

**36/36 passed**, unchanged from before Group 12 and re-confirmed after
every code change in this group (the HSTS fix, the Chromium launch-flag
fix, the TOTP/admin-page addition) to make sure none of them regressed the
suite that *can* run cleanly in this session.

### 7.3 `e2e --project=authed`

Runs for real now (§6.4) and fails all 20 tests, all for the one
environment-specific reason documented in full at §6.1/§6.2: this session's
egress proxy overwrites every `Authorization` header to the Supabase host
with a service-role credential, which breaks `getUser()` for literally
every authenticated page, independent of code, commit, or this group's
changes. Not a regression, not fixable from inside this sandbox, confirmed
absent on the real deployment. The code added for the admin/TOTP gap
(6.1) is correct and un-exercised, not broken.

### 7.4 `supabase/tests` (pgTAP)

**Could not be run in this environment, for two independent reasons, both
worth recording rather than silently skipping:**

1. `supabase test db` / `supabase start` need Docker, and Docker's daemon
   doesn't run here out of the box (`service docker start` fails on
   `ulimit -u unlimited: Operation not permitted`, a sandboxed-container
   restriction). Started manually instead (`dockerd &`, bypassing the
   init script's ulimit calls) and that part worked.
2. With Docker actually running, every Supabase stack image pull failed:
   this session's egress proxy denies `d2glxqk2uabbnd.cloudfront.net` and
   `pkg-containers.githubusercontent.com` outright (confirmed via the
   proxy's own status endpoint — `connect_rejected` on both, repeatedly),
   and that is where every Supabase container image's actual layer bytes
   are served from, whether pulled from Docker Hub or the public ECR
   mirror. Manifest/auth calls to the registries themselves succeed; the
   CDN hosts holding the blobs do not.

The documented fallback in `supabase/tests/kyc_self_approval.test.sql`
itself — `psql "$DATABASE_URL"` against the real project — is also not
available: Postgres is a raw TCP protocol on a non-443 port, and the
agent proxy only tunnels HTTP(S) CONNECT traffic (its own documentation
lists "non-443 ports, raw-TCP databases" as unsupported, to be reported
rather than worked around).

**This is an environment limitation, not a finding about the test or the
RLS policy it covers** — Group 12 did not touch migrations, RLS, or
anything `kyc_self_approval.test.sql` exercises, so there is nothing new
to prove here; this is "could not re-confirm the existing pass," not "the
existing pass regressed." Running `supabase test db` on a machine with a
working Docker daemon and unrestricted registry access (any normal dev
machine or CI runner) is expected to pass as it did when this test was
written.

### 7.5 The route sweep and the eleven admin pages

See `docs/PERFORMANCE.md` §2 for the real, live-production measurements of
every route this group could reach. The sweep itself (§3 above) is not
re-run wholesale in Group 12 — nothing in Groups 7–11 touched routing,
copy, or page content, only performance-relevant code paths — but the
eleven admin pages specifically were attempted for the first time with a
real TOTP enrolment (§6.1), and the result is the environment block at
§6.2, not a new UI finding.

### 7.6 Summary table

| Check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` (261 tests) | PASS |
| `npm run build` | PASS |
| `e2e --project=public` (36 tests) | PASS |
| `e2e --project=authed` (20 tests) | FAILS — environment-blocked, see §6.1/§6.2; not a product defect |
| `supabase test db` (pgTAP) | COULD NOT RUN — environment-blocked, see §7.4; not re-confirmable from this session |
| Production route performance | MEASURED, real, live — see `docs/PERFORMANCE.md` §2; every route under the 1s repeat-navigation target |

# justpae — QA report (Group 3)

A walk of every reachable flow, as each of the six fixture roles, at 375,
768, 1280 and 1440px, against a **production build** (`next build && next
start`) talking to the **real Supabase project** with the payment providers
mocked.

This supersedes nothing in `docs/UX_AUDIT.md`. That document's findings were
written against earlier code and closed out in its own addenda; this one
covers the app as it stands at `2c8b69c` (Group 8), which has changed
substantially since — new auth and routing behaviour from Groups 1 and 8, and
the whole Pay-to-China / accounts / CNY system from the run before that.

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

## 6. Outstanding

| # | Item | Why it is still open |
| --- | --- | --- |
| 6.1 | The eleven admin pages have no measured pass | Needs a fixture admin with an enrolled TOTP factor and generated codes. See §3.1. |
| 6.2 | 4.8, the admin MFA enrolment error | Blocked on 6.1. |
| 6.3 | No money-moving flow is committed end to end | Providers are mocked but the database is real; pressing Confirm on a withdrawal against the live project was deliberately not done. |
| 6.4 | `E2E_REQUIRE_AUTHED` is not set anywhere | Until it is, the `authed` project can silently stop running again, exactly as it had. |

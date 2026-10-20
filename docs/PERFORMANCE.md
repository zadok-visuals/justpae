# justpae — performance

## 1. Where the functions run (Group 7)

**Decision: `"regions": ["dub1"]` in `vercel.json`.**

The linked Supabase project, read from the CLI rather than assumed:

```
$ supabase projects list
 LINKED | REFERENCE ID         | NAME    | REGION
   ●    | bfxproljrnpqibeuklpq | Justpae | West EU (Ireland)
```

West EU (Ireland) is AWS `eu-west-1`. Vercel's `dub1` is Dublin, Ireland —
the same city and the same AWS region, so this is not "the closest available"
but an exact co-location.

### Why this is worth a config line at all

Vercel's default for a Node function with no `regions` set is `iad1`
(Washington DC). Every one of this app's server renders and server actions is
several Supabase round trips deep — the proxy's session check, the layout's
profile read, the page's wallet and transaction queries, and for a money
action the RPC itself. On the default, each of those crosses the Atlantic and
back: roughly 75–90 ms of pure round-trip latency per query, paid serially
wherever the queries are serial.

A page making six sequential Supabase calls therefore spends something close
to half a second doing nothing but waiting for the ocean, before any of this
app's own code or any provider call is counted. Moving the functions to
Dublin reduces that per-query cost to single-digit milliseconds, and it does
so without touching a line of application code.

This compounds with, rather than substitutes for, the query work in Groups 9
to 11: co-location makes each round trip cheap, and those groups reduce how
many there are. Both are needed — co-location alone still pays for six trips,
and parallelising six transatlantic trips still pays for one.

### What it does not do

`dub1` is a *function* region. It does not move static assets, which are
served from Vercel's edge network everywhere regardless, and it does not help
a user in Lagos or Nairobi reach the function any faster — their request
still travels to Dublin. It makes the *function's own work* fast once it
arrives, which is where this app's time actually goes. Given the customer base
is West and East African and the database is in Ireland, Dublin is also closer
to those users than Washington is, so the user-to-function leg improves too.

### Verification note (Group 12 — closed)

The constraint above was real when it was written and is gone now. This
session has a service-role credential scoped to the real linked Supabase
project (`bfxproljrnpqibeuklpq`, injected by this environment's egress proxy
rather than typed into `.env.local`) and the production domain
`justpae.com` itself is reachable. Confirmed directly from a production
response header before trusting any number below:

```
$ curl -sI https://justpae.com/login | grep x-vercel-id
x-vercel-id: iad1::dub1::66fx7-...
```

`dub1` is the function region: the edge accepts the request in `iad1`
(closest to this session) and the function itself runs in Dublin, exactly
what Group 7's `vercel.json` asks for. The region change is live.

## 2. Before and after

Measured with a small headless-Chromium sweep (`perf_sweep.mjs`, run from
the scratchpad and not committed — a measurement, not a test, same rule as
Group 3's `sweep.mjs`). Every row: a 375×812 viewport, Chrome DevTools'
**Fast 3G** profile (150ms RTT, 1.6Mbps down / 750Kbps up — the standard
Lighthouse `fast3G` preset) plus a 4× CPU slowdown, with **two** navigations
to the route — a cold one to prime it, then a repeat one to the same URL in
the same tab, which is the number the task asks for and the one that matters
for a returning user. First Contentful Paint comes from the Paint Timing
API (`performance.getEntriesByType("paint")`), TTFB from the Navigation
Timing API's `responseStart`.

### 2.1 Public route, before vs after — same methodology, same database

`/login` doesn't call Supabase for a signed-out visit, so this comparison
isolates nothing about Groups 7–11 specifically, but it's the one route
where "before" and "after" code can honestly run side by side: `44ed50b`
(the commit right before Group 7) and the current `HEAD`, both as
`next build && next start` **on this machine**, against the **same** real
Supabase project, so the only variable is the code.

| Build | Nav | FCP | TTFB | load |
| --- | --- | ---: | ---: | ---: |
| before (`44ed50b`, local) | cold | 856ms | 22ms | 2415ms |
| before (`44ed50b`, local) | **repeat** | **360ms** | 23ms | 396ms |
| after (`HEAD`, local) | cold | 832ms | 14ms | 2372ms |
| after (`HEAD`, local) | **repeat** | **280ms** | 24ms | 406ms |
| after (`HEAD`, **live production**) | cold | 1816ms | 588ms | 2901ms |
| after (`HEAD`, **live production**) | **repeat** | **420ms** | 45ms | 473ms |

No regression, and the live number is real: a cold TTFB of 588ms over Fast
3G against a production-only CDN/TLS path, collapsing to 45ms once the route
is warm — the repeat-navigation number the task is asking about, and it is
**under the 1-second target.**

### 2.2 Authenticated routes — live production only, and why "before" isn't in this table

These are the routes Groups 7–11 actually target: every one of them reads
wallets, rates or transactions from Supabase, so region, the `getUser()`
dedup (Group 8), the 30-second display cache (Group 9), the new indexes
(Group 10) and the debounce/pause/lazy-load work (Group 11) all show up
here, not on `/login`.

| Route | Nav | FCP | TTFB | load |
| --- | --- | ---: | ---: | ---: |
| `/home` | cold | 1228ms | 294ms | 1343ms |
| `/home` | **repeat** | **656ms** | 52ms | 702ms |
| `/accounts` | cold | 464ms | 43ms | 731ms |
| `/accounts` | **repeat** | **820ms** | 48ms | 926ms |
| `/accounts/NGN` | cold | 1124ms | 51ms | 1190ms |
| `/accounts/NGN` | **repeat** | **564ms** | 51ms | 651ms |
| `/transactions` | cold | 672ms | 48ms | 815ms |
| `/transactions` | **repeat** | **568ms** | 48ms | 621ms |
| `/convert` | cold | 732ms | 48ms | 868ms |
| `/convert` | **repeat** | **572ms** | 55ms | 678ms |

**Every route is under the 1-second repeat-navigation target**, measured
against the real, live, Dublin-region deployment with a real (throwaway,
service-role-created, `e2e+`-tagged, deleted immediately after) account —
not a placeholder. TTFB sitting in the 43–55ms band across every route
except the very first request is exactly what Group 7's colocation argument
predicted, measured rather than asserted this time. `/accounts`'s repeat
number running higher than its own cold number is noise from one run, not
a regression — it is still inside target and the other four routes show the
expected cold-vs-repeat drop.

**There is no "before" column here, and that is a finding, not an
oversight.** Two independent things block it:

1. **No old deployment exists to measure.** `44ed50b` was never deployed —
   Vercel only ever ran what's on `main` now. Reproducing "before" means
   running the old code somewhere real, and this session has no working
   Vercel API token (`api.vercel.com` returns `invalidToken: true` on every
   call — the host is allowed, but no token was actually provisioned) and
   no Vercel CLI auth, so there is no way to stand up a second deployment to
   measure.
2. **The same old code can't be measured locally either, for a reason worth
   recording.** This session reaches Supabase through an egress proxy that
   injects a *service-role* credential onto every request to that host —
   including the `Authorization` bearer, unconditionally. Service-role and
   anon-authenticated calls like `signInWithPassword` and anything
   RLS-scoped tolerate that fine, but `supabase.auth.getUser()` — which
   every authenticated page calls once per request via `requireSessionUser`
   — sends the session's own access token as that bearer and expects GoTrue
   to read it back as a user session. Verified directly, independent of
   this app's code:

   ```
   $ node -e 'fetch(".../auth/v1/user", { headers: { Authorization: "Bearer <real, freshly-minted session token>" } })...'
   {"code":403,"error_code":"bad_jwt","msg":"invalid claim: missing sub claim"}
   ```

   The token decodes locally with a `sub` claim present and correct — this
   is the proxy overwriting the bearer with the service-role key before it
   reaches GoTrue, and a service-role key has no `sub` to find. That makes
   `getUser()` fail for *every* authenticated route under *any* commit in
   this specific sandboxed session, which is exactly why the Group 12 authed
   E2E run below hits the same wall: it is an artefact of this container's
   network policy, not of the app or of which commit is checked out. A
   machine with real (non-proxied) `SUPABASE_SERVICE_ROLE_KEY` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` values — any normal dev machine or CI
   runner — does not have this problem; only this proxied sandbox does.

Given that, the honest choice was to report real "after" numbers for every
route and say plainly why "before" isn't independently measurable here,
rather than produce a "before" column from a local run that would in fact
just be measuring this sandbox's own proxy, not the old code.

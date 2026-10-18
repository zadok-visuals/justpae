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

### Verification note

Re-measurement against a deployment is not possible from this machine: there
are no real credentials here (`.env.local` is the unmodified skeleton — see
the note in the QA report), and no Vercel CLI or linked Vercel project. The
region change is a one-line configuration whose effect is a property of
geography rather than of this codebase, but the before/after table below is
therefore **not** filled in from a hosted deployment, and should not be read
as though it were.

## 2. Before and after

Not yet measured. See the verification note above: measuring this honestly
needs a deployment with working credentials, which this machine does not have.
Filling the table with locally-produced numbers against a placeholder Supabase
project would produce a table that looks like evidence and is not.

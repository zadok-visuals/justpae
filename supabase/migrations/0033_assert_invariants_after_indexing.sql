-- ============================================================================
-- justpae 0033 — prove 0032 opened nothing, and re-run its probe.
--
-- This migration changes NOTHING. It has no DDL, no DML and no grant. It
-- exists to run two things that have to be run against the real database and
-- for which this project has no other channel.
--
-- ──────────────────────────────────────────────────────────────────────────
-- 1. WHY THIS IS A MIGRATION AND NOT A TEST RUN
--
-- The standing rule in this repo is that every change is checked against
-- `supabase/tests` and the phase invariant assertions before it is pushed.
-- Those assertions are SQL functions living on the database — they read
-- pg_proc, pg_policies and information_schema.role_table_grants and raise if
-- a user session can reach something it must not.
--
-- Running them normally means a local Postgres (`supabase db reset`, pgTAP),
-- and this machine has neither Docker nor psql, so there is no local database
-- to reset and no client to connect with. The only channel to the linked
-- project from here is `supabase db push`. So the assertion runs as a
-- migration, which is the honest version of "re-run the invariant assertion
-- against the live linked database" rather than the version where it is
-- skipped and reported as passing.
--
-- It is also not wasted on a future environment. 0014, 0015, 0016 and 0018
-- each end by calling these same functions for the same reason: an assertion
-- that only ran once, on one machine, on one day, is a comment.
--
-- ──────────────────────────────────────────────────────────────────────────
-- 2. WHAT 0032 COULD HAVE BROKEN, SPECIFICALLY
--
-- One thing, and it is worth naming rather than hand-waving at "indexes are
-- safe". 0032 created a function, explain_hot_query_plans(uuid), and in
-- Postgres a newly created function is EXECUTABLE BY PUBLIC by default. That
-- default is the exact hole assert_phase1_invariants() was written to catch:
-- its first check asks pg_proc for every function in `public` that
-- `authenticated` or `anon` can execute and raises on anything outside a
-- nine-name allowlist.
--
-- 0032 revokes it in the same migration. This asserts that the revoke
-- actually took, from the catalog, rather than from the fact that the
-- statement was in the file.
--
-- The index work itself cannot affect any of the three assertions — an index
-- is not a grant, a policy or a function — but running all three costs
-- milliseconds and the alternative is reasoning about which one to skip.
--
-- ──────────────────────────────────────────────────────────────────────────
-- 3. THE SECOND PROBE RUN
--
-- 0032's own after-plans were printed as NOTICEs during its push. This runs
-- explain_hot_query_plans() once more so the plans are captured against the
-- database as it is now — statistics analyzed, every index in place and the
-- planner given a chance to settle — rather than within the same transaction
-- that created them.
-- ============================================================================

do $$
declare
  r record;
begin
  -- ── The assertions ──────────────────────────────────────────────────────
  -- Each raises on failure, which aborts this migration's transaction and
  -- fails the push. There is no soft path: a grant regression on a money
  -- function is not something to log and continue past.
  perform assert_phase1_invariants();
  raise notice '0033: assert_phase1_invariants() passed — no unexpected function is executable by a user session, and every allowlisted one still is.';

  perform assert_phase3_invariants();
  raise notice '0033: assert_phase3_invariants() passed.';

  perform assert_phase4_invariants();
  raise notice '0033: assert_phase4_invariants() passed.';

  -- ── The plans, as the database stands now ───────────────────────────────
  raise notice '════ 0033 PLANS (post-0032, analyzed) ════';
  for r in select * from explain_hot_query_plans() loop
    raise notice '[%|%] %',
      r.query_name,
      case when r.forced_index then 'forced' else 'natural' end,
      r.plan_line;
  end loop;
end;
$$;

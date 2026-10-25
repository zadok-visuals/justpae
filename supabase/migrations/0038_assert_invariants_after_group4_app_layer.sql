-- ============================================================================
-- justpae 0038 — re-run the invariants after Group 4's APPLICATION layer.
--
-- NO SCHEMA CHANGE. This file exists only to prove, against the live project,
-- that the application code written on top of 0037 did not need and did not
-- get a single loosened grant.
--
-- WHY IT IS A MIGRATION. This machine has neither Docker nor psql — the same
-- situation 0033 and 0037 record — so there is no local database to reset,
-- no pgTAP runner and no client to connect with. `supabase db push` is the
-- only path to the database that exists here, which makes a clean apply the
-- only honest way to re-run the assertions before shipping.
--
-- WHAT THE APP LAYER COULD HAVE BROKEN, and what these catch:
--
--   * A customer-callable money function. The natural shortcut while wiring
--     the deposit screen is to grant execute on create_manual_deposit or
--     mark_manual_deposit_sent to `authenticated` so the browser can call
--     them directly. Check 1 of assert_phase1_invariants catches exactly
--     that, and 0037 names all six by name so a DROP is caught too.
--   * An insert policy on `deposits`. The other natural shortcut — letting
--     the customer write their own row — would turn this rail into "the
--     customer asserts they were paid".
--   * A public screenshot bucket, or missing owner-folder policies.
--
-- The behavioural rules (the received amount credits rather than the
-- requested one, a double approve credits once, the dual-admin threshold,
-- the expiry, rejection) are asserted in 0037 section 10 and are not repeated
-- here: nothing in the application layer can change them, and 150 duplicated
-- lines that cannot fail independently are not a second test.
-- ============================================================================

do $$
begin
  perform assert_phase1_invariants();
  perform assert_phase3_invariants();
  perform assert_phase4_invariants();
  raise notice 'Invariants hold after the Group 4 application layer.';
end;
$$;

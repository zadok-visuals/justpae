-- ============================================================================
-- justpae 0014 — the Phase 1 fixes, asserted rather than assumed.
--
-- WHY A MIGRATION THAT ONLY CHECKS THINGS
--
-- Every hole closed in 0010-0013 was a hole in the PRIVILEGE system, not in
-- application code — a grant that was wider than intended, a policy that
-- constrained rows but not columns, a function left callable because Postgres
-- grants EXECUTE to PUBLIC by default and nobody said otherwise. None of that
-- is visible in a diff of the application, and none of it is caught by lint,
-- typecheck or build.
--
-- So the end state is asserted directly against the catalog. assert_phase1_
-- invariants() raises on the first thing that is wrong and says what it is. It
-- is called at the bottom of this migration, which means `supabase db push`
-- applying cleanly IS the verification — and it is a function rather than
-- inline SQL so it can be re-run at any time, by anyone, against any
-- environment:
--
--   select assert_phase1_invariants();
--
-- A quiet `t` is a pass. Anything else names the regression.
--
-- Re-run it after any future migration that touches grants. "We never granted
-- it" is not the same as "a session cannot call it", and that gap is what
-- every one of these bugs was made of.
-- ============================================================================

-- ── First, the default-PUBLIC leftovers ────────────────────────────────────
-- These three are trigger functions. They return `trigger`, so they cannot be
-- invoked through PostgREST or a plain SELECT and are not reachable in
-- practice. They are revoked anyway, because the rule this codebase follows is
-- that a server-only function is explicitly revoked rather than left callable
-- on the grounds that calling it happens to be impossible — the next person to
-- read the grant table should not have to work that out.
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function profiles_guard_protected_columns() from public, anon, authenticated;
revoke execute on function kyc_documents_force_pending_status() from public, anon, authenticated;

-- ── The assertion ──────────────────────────────────────────────────────────
create function assert_phase1_invariants()
returns boolean
language plpgsql
as $$
declare
  -- The ONLY functions in `public` that an end-user session may execute. Every
  -- entry is justified in the Phase 1 grant audit (see the commit message):
  -- each either takes no value that affects money, or derives every such value
  -- server-side from a locked row or from app_settings.
  v_allowed text[] := array[
    'set_withdrawal_pin',
    'create_withdrawal_request',
    'set_withdrawal_recipient',
    'has_transaction_pin',
    'assert_pin_acceptable',
    'quote_bill_fee',
    'my_recipient_change_hold_active',
    'is_end_user_request',
    'assert_phase1_invariants'
  ];
  -- Dropped outright in 0010-0013. Their continued absence is the fix.
  v_must_not_exist text[] := array[
    'create_conversion',
    'create_bill_payment',
    'set_transaction_provider_reference',
    'change_withdrawal_pin',
    'request_recipient_change',
    'confirm_recipient_change'
  ];
  v_offenders text;
  v_count integer;
begin
  -- ── 1. No unexpected function is executable by a user session ───────────
  -- has_function_privilege resolves grants made DIRECTLY and grants inherited
  -- via PUBLIC, which is the whole point: a function nobody granted is still
  -- callable until someone revokes it.
  select string_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), ', ')
  into v_offenders
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not (p.proname = any(v_allowed))
    and (
      has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
    );

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION: these functions are executable by a user session but should not be: %', v_offenders;
  end if;

  -- ── 2. Every allowlisted function still works ──────────────────────────
  -- The inverse check, and not a formality: revoking too much is an outage,
  -- and an assertion that only looks for excess privilege would pass happily
  -- on a database where /withdraw is broken for everyone.
  select string_agg(a.name, ', ') into v_offenders
  from unnest(v_allowed) as a(name)
  where a.name <> 'assert_phase1_invariants'
    and not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = a.name
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION: these functions should be executable by authenticated but are not: %', v_offenders;
  end if;

  -- ── 3. The dropped functions are still gone ────────────────────────────
  select string_agg(m.name, ', ') into v_offenders
  from unnest(v_must_not_exist) as m(name)
  where exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = m.name
  );

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION: these functions were dropped for taking caller-supplied money values and have come back: %', v_offenders;
  end if;

  -- ── 4. profiles: UPDATE only on `phone` ────────────────────────────────
  select string_agg(c.column_name, ', ') into v_offenders
  from information_schema.column_privileges c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.privilege_type = 'UPDATE'
    and c.grantee in ('authenticated', 'anon', 'PUBLIC')
    and c.column_name <> 'phone';

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION (1.2): a user session can UPDATE these profiles columns: %. Only phone may be granted — kyc_status in this list is the self-approval hole.', v_offenders;
  end if;

  if not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and privilege_type = 'UPDATE' and grantee = 'authenticated' and column_name = 'phone'
  ) then
    raise exception 'PHASE 1 REGRESSION (1.2): authenticated cannot update profiles.phone, which it legitimately should.';
  end if;

  -- ── 5. The guard triggers exist ────────────────────────────────────────
  -- Column grants are the layer that actually stops the PATCH; the triggers
  -- are what survive someone widening a grant by accident later.
  if not exists (
    select 1 from pg_trigger
    where tgname = 'profiles_guard_protected_columns' and not tgisinternal
  ) then
    raise exception 'PHASE 1 REGRESSION (1.2): the profiles_guard_protected_columns trigger is missing.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'kyc_documents_force_pending_status' and not tgisinternal
  ) then
    raise exception 'PHASE 1 REGRESSION (1.2): the kyc_documents_force_pending_status trigger is missing.';
  end if;

  -- ── 6. kyc_documents: no write privilege on `status` ───────────────────
  select string_agg(distinct c.privilege_type, ', ') into v_offenders
  from information_schema.column_privileges c
  where c.table_schema = 'public'
    and c.table_name = 'kyc_documents'
    and c.column_name = 'status'
    and c.privilege_type in ('INSERT', 'UPDATE')
    and c.grantee in ('authenticated', 'anon', 'PUBLIC');

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION (1.2): a user session holds % on kyc_documents.status — it could mark its own documents approved.', v_offenders;
  end if;

  -- ── 7. withdrawal_pins is unreachable ──────────────────────────────────
  -- The hash was readable because a SELECT policy existed and the client picks
  -- the column list. Both the policies and the table grants must be gone.
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'withdrawal_pins';

  if v_count > 0 then
    raise exception 'PHASE 1 REGRESSION (1.4a): withdrawal_pins has % RLS policy/policies. Any SELECT policy also exposes pin_hash.', v_count;
  end if;

  select string_agg(distinct privilege_type, ', ') into v_offenders
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'withdrawal_pins'
    and grantee in ('authenticated', 'anon', 'PUBLIC');

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION (1.4a): a user session holds % on withdrawal_pins.', v_offenders;
  end if;

  -- ── 8. conversion_quotes is unreachable ────────────────────────────────
  -- A readable quote leaks the unsettled rate trail; a writable one recreates
  -- the whole 1.1 attack with extra steps.
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'conversion_quotes';

  if v_count > 0 then
    raise exception 'PHASE 1 REGRESSION (1.1): conversion_quotes has % RLS policy/policies and must have none.', v_count;
  end if;

  select string_agg(distinct privilege_type, ', ') into v_offenders
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'conversion_quotes'
    and grantee in ('authenticated', 'anon', 'PUBLIC');

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION (1.1): a user session holds % on conversion_quotes.', v_offenders;
  end if;

  if not exists (
    select 1 from pg_tables where schemaname = 'public'
      and tablename = 'conversion_quotes' and rowsecurity
  ) then
    raise exception 'PHASE 1 REGRESSION (1.1): RLS is not enabled on conversion_quotes.';
  end if;

  -- ── 9. One provider transfer cannot back two rows ──────────────────────
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'transactions_provider_reference_unique'
  ) then
    raise exception 'PHASE 1 REGRESSION (1.1e): the unique index on transactions(provider, provider_reference) is missing.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'deposits_provider_reference_unique'
  ) then
    raise exception 'PHASE 1 REGRESSION (1.1e): the unique index on deposits(provider, provider_reference) is missing.';
  end if;

  -- ── 10. The PIN lockout columns exist ──────────────────────────────────
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'withdrawal_pins'
      and column_name in ('failed_attempts', 'locked_until')
    group by table_name having count(*) = 2
  ) then
    raise exception 'PHASE 1 REGRESSION (1.4b): withdrawal_pins is missing failed_attempts and/or locked_until.';
  end if;

  -- ── 11. The manual-review columns exist ────────────────────────────────
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions'
      and column_name in ('needs_manual_review', 'manual_review_reason')
    group by table_name having count(*) = 2
  ) then
    raise exception 'PHASE 1 REGRESSION (1.1f): transactions is missing needs_manual_review and/or manual_review_reason.';
  end if;

  return true;
end;
$$;

-- Readable by a user session on purpose: it reports only whether the database
-- is configured correctly, which is not a secret, and being able to run it
-- from anywhere is most of its value.
grant execute on function assert_phase1_invariants() to authenticated;

-- ── And run it. A clean `db push` of this file is the verification. ────────
do $$
begin
  perform assert_phase1_invariants();
  raise notice 'Phase 1 invariants hold.';
end;
$$;

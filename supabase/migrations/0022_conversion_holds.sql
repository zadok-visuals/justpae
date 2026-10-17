-- ============================================================================
-- justpae 0022 — the conversion checks happen BEFORE the provider call.
--
-- WHAT WAS WRONG
--
-- src/lib/actions/convert.ts executeConversion ran in this order:
--
--   1. busha.createQuote(...)        ← provider call
--   2. busha.createTransfer(quote)   ← PROVIDER MOVES FUNDS
--   3. insert conversion_quotes
--   4. create_conversion_from_quote  ← PIN checked here. Balance checked here.
--
-- So steps 1 and 2 ran for a request that step 4 was about to reject. A wrong
-- PIN, a locked PIN, a suspended account or an empty wallet all produced a
-- real, executed transfer inside the business provider account, and then an
-- error toast. The user's own balance was untouched — create_conversion_from_
-- quote is what debits — which is precisely what makes it bad: the business
-- ate the movement, repeatedly, for free, at whatever rate and volume an
-- attacker chose, by submitting conversions with a deliberately wrong PIN.
--
-- Note what was NOT wrong, so it does not get "fixed": bills and withdrawals
-- already have the right shape. create_bill_payment_for_user and
-- create_withdrawal_request both verify, debit and only then let their caller
-- touch a provider, with a refund path on provider failure. This migration
-- gives conversions the same shape.
--
-- THE SHAPE
--
--   1. begin_conversion_hold   — suspension, PIN, destination wallet, balance,
--                                and the debit. One transaction. No provider.
--   2. …the server action calls the provider…
--   3a. release_conversion_hold            — provider failed. Money goes back.
--   3b. create_conversion_from_held_quote  — provider succeeded. Ledger row is
--                                            written from the provider's own
--                                            reported figures, with no second
--                                            debit.
--
-- WHY THE HOLD IS A DEBIT, NOT A FLAG
--
-- A "reserved" column that leaves the balance alone needs every reader of
-- `balance` to remember to subtract it, and the one that forgets is the
-- double-spend. Moving the money out of `balance` and into a hold row makes
-- every existing reader correct for free, including ones written before holds
-- existed. The wallets_balance_non_negative check then does the concurrency
-- work for us.
--
-- WHY FINALISING DOES NOT RE-VERIFY THE PIN
--
-- The PIN was verified in step 1, in the same transaction that took the money.
-- Re-verifying in step 3b would mean holding the plaintext PIN in server memory
-- across a network call to a third party, which is strictly worse. The hold id
-- is the capability, it is generated server-side, it never reaches the browser,
-- and it is bound to the user id from the verified session on every call.
-- ============================================================================

-- ── conversion_holds ────────────────────────────────────────────────────────
-- Service-role only, like conversion_quotes: RLS on, zero policies, grants
-- revoked. A user must not be able to read, create, or — most of all —
-- release their own hold.
create table conversion_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  source_currency currency not null,
  target_currency currency not null,
  source_amount numeric(18, 2) not null,
  -- held    → the debit has happened, the provider has not answered yet
  -- settled → a transaction row now owns this money
  -- released → the provider failed and the money went back
  status text not null default 'held',
  release_reason text,
  transaction_id uuid references transactions (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint conversion_holds_amount_positive check (source_amount > 0),
  constraint conversion_holds_distinct_currencies check (source_currency <> target_currency),
  constraint conversion_holds_status_valid check (status in ('held', 'settled', 'released')),
  -- A resolved hold has a resolution time; a held one does not. Keeps the
  -- sweeper's predicate honest.
  constraint conversion_holds_resolution_consistent check (
    (status = 'held' and resolved_at is null) or (status <> 'held' and resolved_at is not null)
  )
);

create index conversion_holds_user_created_idx on conversion_holds (user_id, created_at desc);
-- The sweeper's index: only ever scans holds that are still open.
create index conversion_holds_open_idx on conversion_holds (created_at) where status = 'held';

alter table conversion_holds enable row level security;
revoke all on table conversion_holds from public, anon, authenticated;

-- ── 1. begin_conversion_hold ────────────────────────────────────────────────
-- Everything that can reject the conversion, before anything irreversible.
--
-- p_user_id comes from supabase.auth.getUser() in the server action — a
-- verified JWT, server-side — and NOT from auth.uid(), which is null on the
-- service-role client this is called through.
create function begin_conversion_hold(
  p_user_id uuid,
  p_source_currency currency,
  p_target_currency currency,
  p_source_amount numeric,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suspended_at timestamptz;
  v_balance numeric;
  v_hold_id uuid;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_source_currency = p_target_currency then
    raise exception 'Pick two different wallets.';
  end if;

  if p_source_amount is null or p_source_amount <= 0 then
    raise exception 'Enter a valid amount.';
  end if;

  -- SUSPENSION, FIRST, EXPLICITLY.
  --
  -- The assert_user_not_suspended trigger from 0019 fires on INSERT into
  -- transactions — which in this flow happens in step 3b, long after the
  -- provider has been paid. Relying on it here would be relying on a check
  -- that runs after the thing it is supposed to prevent. So it is also
  -- checked directly, here, before anything leaves.
  select suspended_at into v_suspended_at from profiles where id = p_user_id;
  if v_suspended_at is not null then
    raise exception 'This account is suspended. Please contact support.'
      using errcode = 'check_violation';
  end if;

  -- Raises on a wrong or unset PIN. Attempt counting and the five-try lockout
  -- are handled by the caller's resolvePinError, which needs a fresh
  -- transaction to record the attempt — see src/lib/pin.ts.
  perform verify_transaction_pin(p_user_id, p_pin);

  -- The destination wallet must exist before the debit, otherwise a successful
  -- conversion has nowhere to land and the source balance is already gone.
  if not exists (
    select 1 from wallets where user_id = p_user_id and currency = p_target_currency
  ) then
    raise exception 'You do not have a % wallet', p_target_currency;
  end if;

  -- FOR UPDATE serialises concurrent conversions out of the same wallet, so
  -- two simultaneous submissions cannot both pass the balance check.
  select balance into v_balance
  from wallets
  where user_id = p_user_id and currency = p_source_currency
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for currency %', p_source_currency;
  end if;

  if v_balance < p_source_amount then
    raise exception 'Insufficient balance';
  end if;

  update wallets
  set balance = balance - p_source_amount, updated_at = now()
  where user_id = p_user_id and currency = p_source_currency;

  insert into conversion_holds (user_id, source_currency, target_currency, source_amount)
  values (p_user_id, p_source_currency, p_target_currency, p_source_amount)
  returning id into v_hold_id;

  return v_hold_id;
end;
$$;

revoke execute on function begin_conversion_hold(uuid, currency, currency, numeric, text)
  from public, anon, authenticated;

-- ── 2. release_conversion_hold ──────────────────────────────────────────────
-- The provider failed, or never answered. Put the money back.
--
-- IDEMPOTENT ON PURPOSE. This is called from an error path, and error paths
-- get retried — by the action, by the sweeper below, and by a human. A second
-- call on an already-resolved hold returns quietly rather than crediting
-- twice.
create function release_conversion_hold(
  p_hold_id uuid,
  p_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold conversion_holds%rowtype;
begin
  select * into v_hold from conversion_holds where id = p_hold_id for update;

  if v_hold.id is null then
    raise exception 'No such hold.';
  end if;

  -- p_user_id is optional here precisely so the sweeper can release holds it
  -- did not create. When supplied — which is every call from the conversion
  -- action — it must match, so a hold id cannot be used across accounts.
  if p_user_id is not null and v_hold.user_id <> p_user_id then
    raise exception 'No such hold.';
  end if;

  if v_hold.status <> 'held' then
    return;
  end if;

  -- The credit goes back to the SOURCE wallet. Note this deliberately works
  -- for a suspended account: 0019's rule is that suspension stops new
  -- activity and never strands money already in flight, and a refund of the
  -- user's own money is the clearest case of that.
  update wallets
  set balance = balance + v_hold.source_amount, updated_at = now()
  where user_id = v_hold.user_id and currency = v_hold.source_currency;

  update conversion_holds
  set status = 'released', release_reason = left(p_reason, 1000), resolved_at = now()
  where id = p_hold_id;
end;
$$;

revoke execute on function release_conversion_hold(uuid, uuid, text)
  from public, anon, authenticated;

-- ── 3. create_conversion_from_held_quote ────────────────────────────────────
-- The provider succeeded. Write the ledger row from the quote the server
-- recorded against the provider's own response — and do NOT debit again.
--
-- This is create_conversion_from_quote minus the debit and minus the PIN,
-- because the hold already did both. create_conversion_from_quote stays in
-- place, revoked and unused by the conversion path, rather than being dropped:
-- 0010 exists to prove the no-caller-names-a-figure property and dropping its
-- centrepiece would make that history harder to read, not easier.
create function create_conversion_from_held_quote(
  p_user_id uuid,
  p_hold_id uuid,
  p_quote_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold conversion_holds%rowtype;
  v_quote conversion_quotes%rowtype;
  v_transaction_id uuid;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Lock the hold first, then the quote, always in that order. Two code paths
  -- taking the same two locks in opposite orders is a deadlock waiting for
  -- load; fixing the order here is free.
  select * into v_hold from conversion_holds where id = p_hold_id for update;

  if v_hold.id is null or v_hold.user_id <> p_user_id then
    raise exception 'That conversion is no longer valid. Please try again.';
  end if;

  if v_hold.status <> 'held' then
    raise exception 'That conversion has already been settled.';
  end if;

  select * into v_quote from conversion_quotes where id = p_quote_id for update;

  -- Same message for "no such quote" and "someone else's quote", so this is
  -- not an oracle for whether a given uuid exists.
  if v_quote.id is null or v_quote.user_id <> p_user_id then
    raise exception 'That quote is no longer valid. Please try again.';
  end if;

  if v_quote.consumed_at is not null then
    raise exception 'That quote has already been used.';
  end if;

  -- THE QUOTE MUST DESCRIBE THE MONEY THAT WAS ACTUALLY HELD.
  --
  -- Without this, a quote priced for one pair could be settled against a hold
  -- taken on another, crediting a target wallet for a debit that never
  -- matched it. Both are server-written rows, so this should never fire — it
  -- is here because "should never fire" is not a property, it is a hope.
  if v_quote.source_currency <> v_hold.source_currency
     or v_quote.target_currency <> v_hold.target_currency
     or v_quote.source_amount <> v_hold.source_amount then
    raise exception 'That conversion no longer matches the amount held.';
  end if;

  -- Deliberately NOT checking v_quote.expires_at. The quote is written AFTER
  -- the provider has already executed the transfer, from that transfer's own
  -- response. Refusing to record it because a display-countdown lapsed while
  -- the provider was answering would strand a completed movement, which is
  -- the exact failure this whole migration exists to prevent. The TTL governs
  -- what the user may still accept; it cannot govern what already happened.

  insert into transactions (
    user_id, type, provider, status, amount, currency,
    target_currency, target_amount, provider_reference,
    provider_rate, markup_rate, customer_rate, raw_target_amount
  )
  values (
    p_user_id, 'convert', 'busha', 'pending', v_quote.source_amount, v_quote.source_currency,
    v_quote.target_currency, v_quote.target_amount, v_quote.provider_reference,
    v_quote.provider_rate, v_quote.markup_rate, v_quote.customer_rate, v_quote.raw_target_amount
  )
  returning id into v_transaction_id;

  update conversion_quotes set consumed_at = now() where id = p_quote_id;

  update conversion_holds
  set status = 'settled', transaction_id = v_transaction_id, resolved_at = now()
  where id = p_hold_id;

  return v_transaction_id;
end;
$$;

revoke execute on function create_conversion_from_held_quote(uuid, uuid, uuid)
  from public, anon, authenticated;

-- ── 4. expire_stale_conversion_holds ────────────────────────────────────────
-- The safety net for the one case the action cannot handle itself: the server
-- died between the hold and the provider's answer, so neither the release nor
-- the settle ever ran and the user's money is sitting in a held row with
-- nobody coming back for it.
--
-- Fifteen minutes is far longer than any provider call this app makes (the
-- client's own timeout is measured in seconds), so a hold older than that is
-- not slow, it is abandoned. Called by the reconcile cron.
create function expire_stale_conversion_holds(p_older_than interval default interval '15 minutes')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold record;
  v_count integer := 0;
begin
  for v_hold in
    select id from conversion_holds
    where status = 'held' and created_at < now() - p_older_than
    order by created_at
  loop
    perform release_conversion_hold(
      v_hold.id,
      null,
      'Automatically released: the conversion did not complete.'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function expire_stale_conversion_holds(interval)
  from public, anon, authenticated;

-- ── 5. The Phase 1 invariants, extended ─────────────────────────────────────
-- 0014's assertion catches a function that is callable when it should not be.
-- That is the catch-all, and it would catch a forgotten revoke above. This
-- replaces it with a version that also asserts the inverse for the money
-- functions BY NAME: that each one still exists, and is still revoked.
--
-- The difference matters. The catch-all notices privilege that was added. A
-- named list also notices a function that was DROPPED — which is the other way
-- to end up with no protection, and the one a grant audit sails straight past.
create or replace function assert_phase1_invariants()
returns boolean
language plpgsql
as $$
declare
  -- Carried forward from 0019 unchanged. 0022 adds no user-callable function,
  -- so nothing joins this list here.
  v_allowed text[] := array[
    -- Phase 1
    'set_withdrawal_pin',
    'create_withdrawal_request',
    'set_withdrawal_recipient',
    'has_transaction_pin',
    'assert_pin_acceptable',
    'quote_bill_fee',
    'my_recipient_change_hold_active',
    'is_end_user_request',
    'assert_phase1_invariants',
    -- Phase 3
    'unread_notification_count',
    'mark_all_notifications_read',
    'unread_support_count',
    'mark_support_thread_read',
    'assert_phase3_invariants',
    -- Phase 4
    'assert_phase4_invariants'
  ];
  v_must_not_exist text[] := array[
    'create_conversion',
    'create_bill_payment',
    'set_transaction_provider_reference',
    'change_withdrawal_pin',
    'request_recipient_change',
    'confirm_recipient_change'
  ];
  -- Every function that moves money or changes KYC, PIN, recipients or roles.
  -- Each must EXIST and must NOT be executable by a user session. Extend this
  -- in the same migration that adds such a function — an unlisted money
  -- function is still caught by check 1 below, but only while someone
  -- remembers to revoke it; listing it means its disappearance is caught too.
  v_must_be_server_only text[] := array[
    'verify_transaction_pin',
    'create_conversion_from_quote',
    'create_bill_payment_for_user',
    'complete_conversion',
    'fail_conversion',
    'credit_deposit',
    'fail_deposit',
    'begin_conversion_hold',
    'release_conversion_hold',
    'create_conversion_from_held_quote',
    'expire_stale_conversion_holds'
  ];
  v_offenders text;
  v_count integer;
begin
  -- ── 1. No unexpected function is executable by a user session ───────────
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
  select string_agg(a.name, ', ') into v_offenders
  from unnest(v_allowed) as a(name)
  where a.name not in ('assert_phase1_invariants', 'assert_phase3_invariants', 'assert_phase4_invariants')
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
    raise exception 'PHASE 1 REGRESSION: these functions were dropped in 0010-0013 and must not come back: %', v_offenders;
  end if;

  -- ── 4. Every named money function still exists ─────────────────────────
  select string_agg(m.name, ', ') into v_offenders
  from unnest(v_must_be_server_only) as m(name)
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = m.name
  );

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION: these money functions have gone missing: %', v_offenders;
  end if;

  -- ── 5. …and none of them is reachable from a user session ──────────────
  -- Redundant with check 1 today. Not redundant the day somebody adds a name
  -- to v_allowed without thinking about what it is: this check has no
  -- allowlist to be added to.
  select string_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), ', ')
  into v_offenders
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any(v_must_be_server_only)
    and (
      has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
    );

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION: these money functions are executable by a user session: %', v_offenders;
  end if;

  -- ── 6. conversion_holds is as locked down as conversion_quotes ─────────
  -- RLS on, and no role that goes through RLS holds a table privilege.
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'conversion_holds' and c.relrowsecurity
  ) then
    raise exception 'PHASE 1 REGRESSION: conversion_holds does not have RLS enabled';
  end if;

  select count(*) into v_count
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'conversion_holds'
    and grantee in ('anon', 'authenticated', 'public');

  if v_count > 0 then
    raise exception 'PHASE 1 REGRESSION: conversion_holds has % grant(s) to a user role', v_count;
  end if;

  return true;
end;
$$;

-- assert_phase1_invariants is itself in v_allowed, so it stays callable by
-- `authenticated` exactly as 0014 left it: anyone may ask whether the
-- database is still correct.

-- Applying this migration IS the verification. A failure here aborts the
-- transaction and nothing above is applied.
select assert_phase1_invariants();

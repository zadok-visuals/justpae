-- ============================================================================
-- justpae 0024 — fiat to fiat is two provider legs, and the schema says so.
--
-- WHAT WAS WRONG
--
-- src/lib/rates/routes.ts has always PRICED a fiat-to-fiat pair as a bridge
-- through USDT — `fiat_via_usdt`, the rate being (1 / buyRate(from)) *
-- sellRate(to) — because the provider quotes no direct pair between any two
-- of our fiat currencies. But executeConversion then sent ONE
-- createQuote(from, to) for that same pair, which the provider does not
-- offer. So NGN to KES priced correctly on screen and then failed at the
-- provider, every time, for a reason the error did not explain.
--
-- The pricing was right. The execution did not match it.
--
-- THE SHAPE
--
-- Leg 1: source fiat -> USDT.
-- Leg 2: USDT       -> target fiat.
--
-- Both inside the Group 1 hold from 0022, so the user's money is already out
-- of their balance before either leg runs and cannot be spent twice while
-- they are in flight. Three outcomes:
--
--   both legs succeed   the hold settles into a normal 'convert' row and the
--                       target wallet is credited on completion, as before.
--   leg 1 fails         nothing has moved at the provider. Release the hold.
--                       Identical to a single-leg provider failure.
--   leg 2 fails         THE INTERESTING ONE. Leg 1 really did convert the
--                       user's naira into USDT. That USDT exists. Releasing
--                       the hold would refund naira the user no longer has a
--                       claim to AND leave the USDT with the business, which
--                       is a double credit against us; marking it 'failed'
--                       would do the same via fail_conversion's refund. So
--                       the USDT is credited to the user's own USDT wallet
--                       and the row becomes 'partially_completed'.
--
-- NO FIGURE ARRIVES FROM A CALLER, STILL
--
-- partially_complete_conversion takes an id and a reason. The USDT amount it
-- credits is read off the transaction row's own leg1_target_amount, which was
-- written from the provider's leg-1 response by server code holding the
-- service role, via the quote row. That is the same rule 0010 established and
-- 0022 kept: a money function takes an identifier, never an amount.
-- ============================================================================

-- ── The leg trail, on the quote ─────────────────────────────────────────────
-- conversion_quotes is the server's record of what the provider actually did,
-- written after the calls and read by the settle function. A two-leg
-- conversion has two references and an intermediate amount, so they live here
-- first and are copied onto the transaction at settle time.
alter table conversion_quotes
  add column bridge_currency currency,
  add column leg1_provider_reference text,
  add column leg2_provider_reference text,
  -- USDT the provider delivered on leg 1, already markup-adjusted by the
  -- server. This is what a partial completion credits, so it is a figure the
  -- user may end up holding — it is written by server code from the
  -- provider's own response and never by a caller.
  add column leg1_target_amount numeric(18, 2);

-- ── …and on the transaction ─────────────────────────────────────────────────
alter table transactions
  add column bridge_currency currency,
  add column leg1_provider_reference text,
  add column leg2_provider_reference text,
  add column leg1_target_amount numeric(18, 2),
  -- What was actually credited on a partial completion. Distinct from
  -- leg1_target_amount so a later correction is visible rather than silently
  -- overwriting the provider's reported figure.
  add column partial_credit_amount numeric(18, 2);

-- The existing unique index on (provider, provider_reference) keeps one real
-- provider transfer backing at most one ledger row. The leg references need
-- the same guarantee, and for the same reason: a redelivered webhook or a
-- re-run reconciler must not be able to attach one leg to a second row.
create unique index transactions_leg1_reference_idx
  on transactions (provider, leg1_provider_reference)
  where leg1_provider_reference is not null;
create unique index transactions_leg2_reference_idx
  on transactions (provider, leg2_provider_reference)
  where leg2_provider_reference is not null;

-- ── create_conversion_from_held_quote, carrying the legs ───────────────────
-- Replaces 0022's version. Same contract — an id and a hold, no figures — plus
-- the leg trail copied across.
create or replace function create_conversion_from_held_quote(
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

  -- Hold first, then quote, always in that order — two paths taking the same
  -- two locks in opposite orders is a deadlock waiting for load.
  select * into v_hold from conversion_holds where id = p_hold_id for update;

  if v_hold.id is null or v_hold.user_id <> p_user_id then
    raise exception 'That conversion is no longer valid. Please try again.';
  end if;

  if v_hold.status <> 'held' then
    raise exception 'That conversion has already been settled.';
  end if;

  select * into v_quote from conversion_quotes where id = p_quote_id for update;

  if v_quote.id is null or v_quote.user_id <> p_user_id then
    raise exception 'That quote is no longer valid. Please try again.';
  end if;

  if v_quote.consumed_at is not null then
    raise exception 'That quote has already been used.';
  end if;

  -- The quote must describe the money that was actually held. Both are
  -- server-written rows, so this should never fire — it is here because
  -- "should never fire" is a hope, not a property.
  if v_quote.source_currency <> v_hold.source_currency
     or v_quote.target_currency <> v_hold.target_currency
     or v_quote.source_amount <> v_hold.source_amount then
    raise exception 'That conversion no longer matches the amount held.';
  end if;

  -- expires_at is deliberately not checked: the quote is written AFTER the
  -- provider executed, from its own response. Refusing to record it because a
  -- display countdown lapsed would strand a completed movement.

  insert into transactions (
    user_id, type, provider, status, amount, currency,
    target_currency, target_amount, provider_reference,
    provider_rate, markup_rate, customer_rate, raw_target_amount,
    bridge_currency, leg1_provider_reference, leg2_provider_reference,
    leg1_target_amount
  )
  values (
    p_user_id, 'convert', 'busha', 'pending', v_quote.source_amount, v_quote.source_currency,
    v_quote.target_currency, v_quote.target_amount, v_quote.provider_reference,
    v_quote.provider_rate, v_quote.markup_rate, v_quote.customer_rate, v_quote.raw_target_amount,
    v_quote.bridge_currency, v_quote.leg1_provider_reference, v_quote.leg2_provider_reference,
    v_quote.leg1_target_amount
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

-- ── partially_complete_conversion ──────────────────────────────────────────
-- Leg 1 converted, leg 2 did not. Credit the bridge currency and say so.
--
-- IDEMPOTENT, like every other settlement function here: the webhook, the
-- reconciler and the status poll can all reach this for the same row, and the
-- second one through must not credit again.
create function partially_complete_conversion(
  p_transaction_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx transactions%rowtype;
  v_bridge currency;
  v_amount numeric;
begin
  select * into v_tx
  from transactions
  where id = p_transaction_id and type = 'convert'
  for update;

  if v_tx.id is null or v_tx.status not in ('pending', 'processing') then
    return;
  end if;

  v_bridge := v_tx.bridge_currency;
  v_amount := v_tx.leg1_target_amount;

  -- A single-leg conversion has neither, and must never reach here — there is
  -- no intermediate holding to credit, so the correct outcome is
  -- fail_conversion's refund instead.
  if v_bridge is null or v_amount is null or v_amount <= 0 then
    raise exception 'That conversion has no completed first leg to settle.';
  end if;

  if not exists (
    select 1 from wallets where user_id = v_tx.user_id and currency = v_bridge
  ) then
    -- Every account is provisioned with a USDT wallet at signup, so this is a
    -- data fault rather than a user state. Raising leaves the row pending for
    -- a human, which is right: the alternative is silently discarding the
    -- user's money.
    raise exception 'No % wallet to credit the completed leg into.', v_bridge;
  end if;

  update wallets
  set balance = balance + v_amount, updated_at = now()
  where user_id = v_tx.user_id and currency = v_bridge;

  update transactions
  set status = 'partially_completed',
      partial_credit_amount = v_amount,
      decline_reason = left(p_reason, 1000)
  where id = p_transaction_id;
end;
$$;

revoke execute on function partially_complete_conversion(uuid, text)
  from public, anon, authenticated;

-- ── fail_conversion must refuse a row whose first leg converted ────────────
-- The safety interlock for the whole design. fail_conversion refunds the
-- SOURCE amount; on a two-leg row whose leg 1 succeeded, that source no
-- longer exists as source — it is USDT the user is about to be credited. A
-- refund there pays the user twice.
--
-- The webhook and the reconciler both call fail_conversion on a provider
-- failure without knowing how many legs the row has, so the refusal belongs
-- here rather than in each caller.
create or replace function fail_conversion(p_transaction_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_amount numeric;
  v_currency currency;
  v_status transaction_status;
  v_leg1_amount numeric;
begin
  select user_id, amount, currency, status, leg1_target_amount
  into v_user_id, v_amount, v_currency, v_status, v_leg1_amount
  from transactions
  where id = p_transaction_id and type = 'convert'
  for update;

  if v_user_id is null or v_status not in ('pending', 'processing') then
    return;
  end if;

  -- Leg 1 converted. A source refund would be a second credit, so this is
  -- redirected to the partial path instead of refusing outright — a caller
  -- that reports a failure should not have to know which kind of row it is
  -- holding to get the right outcome.
  if v_leg1_amount is not null and v_leg1_amount > 0 then
    perform partially_complete_conversion(p_transaction_id, p_reason);
    return;
  end if;

  update wallets
  set balance = balance + v_amount, updated_at = now()
  where user_id = v_user_id and currency = v_currency;

  update transactions
  set status = 'failed', decline_reason = left(p_reason, 1000)
  where id = p_transaction_id;
end;
$$;

revoke execute on function fail_conversion(uuid, text) from public, anon, authenticated;

-- ── The invariants, extended ───────────────────────────────────────────────
create or replace function assert_phase1_invariants()
returns boolean
language plpgsql
as $$
declare
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
    'expire_stale_conversion_holds',
    -- 0024
    'partially_complete_conversion'
  ];
  v_offenders text;
  v_count integer;
begin
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

select assert_phase1_invariants();

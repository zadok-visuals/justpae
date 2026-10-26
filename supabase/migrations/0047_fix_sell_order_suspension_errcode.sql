-- ============================================================================
-- justpae 0047 — fix create_sell_order's suspension RAISE errcode.
--
-- WHY THIS EXISTS
--
-- 0046 wrote the suspension guard as:
--
--   raise exception 'This account is suspended. Please contact support.'
--     using errcode = 'check_violation';   -- SQLSTATE 23514
--
-- toRpcError (src/lib/provider-error.ts) only passes a RAISE's message through
-- to the user when the error code is P0001 — the code Postgres assigns to a
-- plain RAISE EXCEPTION that names no other condition. SQLSTATE 23514 is not
-- P0001, so the message was silently replaced by the generic
-- "We couldn't complete that right now." fallback.
--
-- The fix: drop `using errcode = 'check_violation'`. A plain RAISE EXCEPTION
-- emits P0001 by default, which is exactly what toRpcError looks for.
--
-- The same pattern exists in 0022, 0026 and 0019 (begin_conversion_hold,
-- create_pay_to_china_order, etc.) but those are left for a separate
-- migration — changing them here would make this one hard to revert and easy
-- to mis-apply. This migration only touches what 0046 introduced.
-- ============================================================================

create or replace function create_sell_order(
  p_user_id uuid,
  p_expected_usdt_amount numeric,
  p_target_currency currency,
  p_estimated_target_amount numeric,
  p_provider_rate numeric,
  p_markup_rate numeric,
  p_customer_rate numeric,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suspended_at timestamptz;
  v_order_id uuid;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_expected_usdt_amount is null or p_expected_usdt_amount <= 0 then
    raise exception 'Enter a valid amount.';
  end if;

  if p_target_currency = 'USDT' then
    raise exception 'Pick a currency to receive.';
  end if;

  select suspended_at into v_suspended_at from profiles where id = p_user_id;
  if v_suspended_at is not null then
    -- Plain RAISE EXCEPTION emits P0001, which toRpcError passes through to
    -- the user. The original `using errcode = 'check_violation'` (SQLSTATE
    -- 23514) caused the message to be swallowed by the generic fallback.
    raise exception 'This account is suspended. Please contact support.';
  end if;

  perform verify_transaction_pin(p_user_id, p_pin);

  if not exists (
    select 1 from wallets where user_id = p_user_id and currency = p_target_currency
  ) then
    raise exception 'You do not have a % wallet', p_target_currency;
  end if;

  insert into sell_orders (
    user_id, target_currency, expected_usdt_amount, estimated_target_amount,
    provider_rate, markup_rate, customer_rate
  )
  values (
    p_user_id, p_target_currency, p_expected_usdt_amount, p_estimated_target_amount,
    p_provider_rate, p_markup_rate, p_customer_rate
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

-- Permissions are REVOKE-only on this function (0046 line 172-173).
-- create or replace does not reset grants, so the existing revoke still holds
-- and no re-grant is needed here.
revoke execute on function create_sell_order(uuid, numeric, currency, numeric, numeric, numeric, numeric, text)
  from public, anon, authenticated;

-- Quick sanity: the function must exist and must not be callable by a session.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_sell_order';
  if v_count = 0 then
    raise exception '0047 REGRESSION: create_sell_order disappeared after replace.';
  end if;

  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_sell_order'
    and (
      has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
    );
  if v_count > 0 then
    raise exception '0047 REGRESSION: create_sell_order is executable by a user session.';
  end if;

  raise notice '0047 applied: create_sell_order suspension message now reaches the user.';
end;
$$;

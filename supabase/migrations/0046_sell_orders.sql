-- ============================================================================
-- justpae 0046 — sell orders: USDT in, fiat credited to the customer's OWN
-- wallet. Never a bank, never anyone else's wallet.
--
-- THE SHAPE, deliberately mirroring 0022's conversion-hold shape rather than
-- inventing a new one:
--
--   1. create_sell_order            PIN verified, suspension checked, intent
--                                    recorded. No money moves yet — the USDT
--                                    has not even arrived.
--   2. link_sell_order_deposit       the EXISTING deposit flow (actions/
--                                    deposits.ts) creates the USDT deposit;
--                                    this just ties its id to the order.
--   3. claim_sell_order_for_deposit  called once, from TS, right after
--                                    credit_deposit succeeds for that deposit
--                                    — by the webhook, the reconcile cron OR
--                                    the status poll, whichever gets there
--                                    first. Locks the order FOR UPDATE and
--                                    only acts while it is still
--                                    'awaiting_deposit', which is what makes
--                                    three possible callers safe: the second
--                                    and third find the status already moved
--                                    on and do nothing. Debits the USDT the
--                                    deposit just credited into a
--                                    conversion_holds row — same table, same
--                                    rules, the automated path simply never
--                                    had a PIN to check because 1. already
--                                    checked it.
--   4a. settle_sell_order            the provider executed. Ledger row
--                                    written from what it actually delivered,
--                                    no second debit — this IS
--                                    create_conversion_from_held_quote's
--                                    shape, inlined because there is no
--                                    interactive conversion_quotes row here.
--   4b. release_conversion_hold      (existing, reused as-is) + the small
--       mark_sell_order_credited_usdt   wrapper beside it — the provider
--                                        never moved anything, so the USDT
--                                        goes back to the user's own wallet
--                                        and the order says so.
--   5. expire_stale_sell_orders      the cron's safety net for an order
--                                    nobody ever sent USDT to.
--
-- WHY A MISMATCH OVER 10% DOES NOT BLOCK THE SALE
--
-- The received amount is what actually arrived — not the amount the order
-- was opened for — and the existing deposit path already credits whatever
-- arrives (see credit_deposit). Refusing to convert it would leave real USDT
-- sitting unsold for no reason the customer caused; flagging it is how an
-- operator still gets to look at an order that moved a lot more or less than
-- expected.
-- ============================================================================

create type sell_order_status as enum (
  'awaiting_deposit', 'received', 'sold', 'credited_usdt', 'expired', 'failed'
);

create table sell_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  target_currency currency not null,
  expected_usdt_amount numeric(18, 2) not null,
  estimated_target_amount numeric(18, 2) not null,
  -- The rate SHOWN at order creation — display only. Settlement always
  -- re-resolves a fresh route and a fresh provider quote, exactly as every
  -- other conversion in this product does; nothing here is trusted forward.
  provider_rate numeric(24, 10) not null,
  markup_rate numeric(10, 6) not null,
  customer_rate numeric(24, 10) not null,
  status sell_order_status not null default 'awaiting_deposit',
  -- The USDT deposit this order is funded by. Linked after creation, once
  -- the existing deposit flow has provisioned it; one deposit funds at most
  -- one order.
  deposit_id uuid references deposits (id),
  received_usdt_amount numeric(18, 2),
  -- True when received_usdt_amount differs from expected_usdt_amount by more
  -- than 10%. Never blocks the sale — see the file header.
  flagged boolean not null default false,
  -- The conversion_holds row the automated debit took, between 'received'
  -- and either 'sold' or 'credited_usdt'.
  hold_id uuid references conversion_holds (id),
  conversion_transaction_id uuid references transactions (id),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  received_at timestamptz,
  -- Set once the order reaches any of sold / credited_usdt / expired / failed.
  resolved_at timestamptz,
  constraint sell_orders_expected_amount_positive check (expected_usdt_amount > 0),
  constraint sell_orders_target_not_usdt check (target_currency <> 'USDT'),
  constraint sell_orders_deposit_unique unique (deposit_id)
);

create index sell_orders_user_created_idx on sell_orders (user_id, created_at desc);
create index sell_orders_status_idx on sell_orders (status);
-- The expiry sweep's own index: only ever scans orders still waiting.
create index sell_orders_awaiting_idx on sell_orders (created_at) where status = 'awaiting_deposit';

alter table sell_orders enable row level security;

-- The only policy. No insert/update/delete policy exists for `authenticated`
-- at all — every write below happens inside a security-definer function.
create policy "sell_orders: read own" on sell_orders for select using (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 1. create_sell_order
-- ════════════════════════════════════════════════════════════════════════════
-- Records the intent. No provider call, and no debit — the USDT this order
-- will sell has not arrived yet. The PIN is verified HERE because this is
-- the only point in the whole flow where the customer is present to give
-- one; everything from here on is triggered by a webhook or a cron with
-- nobody at a keyboard.
create function create_sell_order(
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
    raise exception 'This account is suspended. Please contact support.'
      using errcode = 'check_violation';
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

revoke execute on function create_sell_order(uuid, numeric, currency, numeric, numeric, numeric, numeric, text)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. link_sell_order_deposit
-- ════════════════════════════════════════════════════════════════════════════
-- Called once, right after the existing deposit flow provisions the USDT
-- deposit this order is funded by. Both ids come from the session's own
-- actions in the same request, so this is a cheap ownership check rather
-- than a trust boundary.
create function link_sell_order_deposit(
  p_sell_order_id uuid,
  p_user_id uuid,
  p_deposit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposit_user_id uuid;
  v_deposit_currency currency;
  v_updated uuid;
begin
  select user_id, currency into v_deposit_user_id, v_deposit_currency
  from deposits where id = p_deposit_id;

  if v_deposit_user_id is null or v_deposit_user_id <> p_user_id then
    raise exception 'No such deposit.';
  end if;
  if v_deposit_currency <> 'USDT' then
    raise exception 'A sell order can only be funded by a USDT deposit.';
  end if;

  update sell_orders
  set deposit_id = p_deposit_id, updated_at = now()
  where id = p_sell_order_id
    and user_id = p_user_id
    and status = 'awaiting_deposit'
    and deposit_id is null
  returning id into v_updated;

  if v_updated is null then
    raise exception 'That sell order can no longer be linked to a deposit.';
  end if;
end;
$$;

revoke execute on function link_sell_order_deposit(uuid, uuid, uuid)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. claim_sell_order_for_deposit — the exactly-once gate
-- ════════════════════════════════════════════════════════════════════════════
-- Called from TS immediately after credit_deposit succeeds for p_deposit_id,
-- from any of three places (the webhook, the reconcile cron, the status
-- poll) — all three may fire for the same deposit, and this is what makes
-- that safe: only the FIRST call finds the row still 'awaiting_deposit' and
-- does anything at all. Every later call (any caller, any process) finds the
-- status already moved on and returns no rows.
--
-- Returns the updated row. An empty result means "nothing to do here" —
-- either this deposit funds no sell order, or one already claimed it.
create function claim_sell_order_for_deposit(
  p_deposit_id uuid,
  p_received_amount numeric
)
returns setof sell_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order sell_orders%rowtype;
  v_suspended_at timestamptz;
  v_balance numeric;
  v_flagged boolean;
  v_hold_id uuid;
begin
  select * into v_order
  from sell_orders
  where deposit_id = p_deposit_id and status = 'awaiting_deposit'
  for update;

  if v_order.id is null then
    return;
  end if;

  v_flagged := abs(p_received_amount - v_order.expected_usdt_amount)
    > (v_order.expected_usdt_amount * 0.10);

  -- Suspension pauses NEW activity; it does not strand money already in
  -- flight (same rule release_conversion_hold follows). The USDT is already
  -- in the user's wallet via credit_deposit — there is simply nobody this
  -- account is allowed to transact on behalf of right now, so it stays
  -- there rather than being sold automatically.
  select suspended_at into v_suspended_at from profiles where id = v_order.user_id;
  if v_suspended_at is not null then
    update sell_orders
    set status = 'credited_usdt',
        received_usdt_amount = p_received_amount,
        flagged = v_flagged,
        failure_reason = 'Account suspended before the sale could run.',
        received_at = now(), resolved_at = now(), updated_at = now()
    where id = v_order.id
    returning * into v_order;
    return next v_order;
    return;
  end if;

  -- FOR UPDATE: this deposit's own credit just ran moments ago in the same
  -- request, so the balance should always cover it — this guards the
  -- "should never happen" case rather than the common one.
  select balance into v_balance
  from wallets
  where user_id = v_order.user_id and currency = 'USDT'
  for update;

  if v_balance is null or v_balance < p_received_amount then
    update sell_orders
    set status = 'failed',
        received_usdt_amount = p_received_amount,
        flagged = v_flagged,
        failure_reason = 'USDT balance did not cover the amount just credited.',
        received_at = now(), resolved_at = now(), updated_at = now()
    where id = v_order.id
    returning * into v_order;
    return next v_order;
    return;
  end if;

  update wallets
  set balance = balance - p_received_amount, updated_at = now()
  where user_id = v_order.user_id and currency = 'USDT';

  insert into conversion_holds (user_id, source_currency, target_currency, source_amount)
  values (v_order.user_id, 'USDT', v_order.target_currency, p_received_amount)
  returning id into v_hold_id;

  update sell_orders
  set status = 'received',
      received_usdt_amount = p_received_amount,
      flagged = v_flagged,
      hold_id = v_hold_id,
      received_at = now(), updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return next v_order;
end;
$$;

revoke execute on function claim_sell_order_for_deposit(uuid, numeric)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 4a. settle_sell_order — the provider executed
-- ════════════════════════════════════════════════════════════════════════════
-- create_conversion_from_held_quote's shape without a conversion_quotes row:
-- there is no interactive quote to consume here, so the figures the caller
-- already resolved server-side (a fresh route, a fresh provider quote) are
-- written straight onto the ledger row.
create function settle_sell_order(
  p_sell_order_id uuid,
  p_hold_id uuid,
  p_user_id uuid,
  p_target_amount numeric,
  p_provider_reference text,
  p_provider_rate numeric,
  p_markup_rate numeric,
  p_customer_rate numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold conversion_holds%rowtype;
  v_order sell_orders%rowtype;
  v_transaction_id uuid;
begin
  select * into v_hold from conversion_holds where id = p_hold_id for update;
  if v_hold.id is null or v_hold.user_id <> p_user_id or v_hold.status <> 'held' then
    raise exception 'That sell order is no longer valid.';
  end if;

  select * into v_order from sell_orders where id = p_sell_order_id for update;
  if v_order.id is null or v_order.user_id <> p_user_id or v_order.status <> 'received'
     or v_order.hold_id is null or v_order.hold_id <> p_hold_id then
    raise exception 'That sell order is no longer valid.';
  end if;

  insert into transactions (
    user_id, type, provider, status, amount, currency,
    target_currency, target_amount, provider_reference,
    provider_rate, markup_rate, customer_rate, raw_target_amount
  )
  values (
    p_user_id, 'convert', 'busha', 'pending', v_hold.source_amount, 'USDT',
    v_order.target_currency, p_target_amount, p_provider_reference,
    p_provider_rate, p_markup_rate, p_customer_rate, p_target_amount
  )
  returning id into v_transaction_id;

  update conversion_holds
  set status = 'settled', transaction_id = v_transaction_id, resolved_at = now()
  where id = p_hold_id;

  update sell_orders
  set status = 'sold', conversion_transaction_id = v_transaction_id,
      resolved_at = now(), updated_at = now()
  where id = p_sell_order_id;

  return v_transaction_id;
end;
$$;

revoke execute on function settle_sell_order(uuid, uuid, uuid, numeric, text, numeric, numeric, numeric)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 4b. mark_sell_order_credited_usdt — the provider never moved anything
-- ════════════════════════════════════════════════════════════════════════════
-- Pairs with the EXISTING release_conversion_hold, which the caller calls
-- first to put the USDT straight back into the user's own wallet — no new
-- refund logic, the same function 0022 already proved safe. This just marks
-- the order for what happened. Idempotent: a no-op once the order has moved
-- past 'received'.
create function mark_sell_order_credited_usdt(p_sell_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update sell_orders
  set status = 'credited_usdt',
      failure_reason = left(p_reason, 1000),
      resolved_at = now(), updated_at = now()
  where id = p_sell_order_id and status = 'received';
end;
$$;

revoke execute on function mark_sell_order_credited_usdt(uuid, text)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. expire_stale_sell_orders — the safety net for a deposit nobody made
-- ════════════════════════════════════════════════════════════════════════════
-- Two ways an order never gets USDT: nobody ever started the deposit, or the
-- deposit itself expired with nothing received. Both are 'expired', not
-- 'failed' — nothing went wrong, a window simply closed.
create function expire_stale_sell_orders(p_older_than interval default interval '30 minutes')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update sell_orders
    set status = 'expired', resolved_at = now(), updated_at = now()
    where status = 'awaiting_deposit'
      and created_at < now() - p_older_than
      and (
        deposit_id is null
        or exists (
          select 1 from deposits d
          where d.id = sell_orders.deposit_id and d.status in ('expired', 'failed')
        )
      )
    returning 1
  )
  select count(*) into v_count from expired;

  return v_count;
end;
$$;

revoke execute on function expire_stale_sell_orders(interval)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. INVARIANTS
-- ════════════════════════════════════════════════════════════════════════════

create function assert_sell_order_invariants()
returns boolean
language plpgsql
as $$
declare
  v_name text;
  v_count integer;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'sell_orders' and c.relrowsecurity
  ) then
    raise exception 'SELL ORDER REGRESSION (0046): RLS is off on sell_orders.';
  end if;

  -- Exactly one policy: read-own. An insert/update/delete policy here would
  -- mean a user session could write its own sell order directly.
  select count(*) into v_count
  from pg_policies where schemaname = 'public' and tablename = 'sell_orders';
  if v_count <> 1 then
    raise exception 'SELL ORDER REGRESSION (0046): sell_orders has % policies, expected exactly 1', v_count;
  end if;

  foreach v_name in array array[
    'create_sell_order', 'link_sell_order_deposit', 'claim_sell_order_for_deposit',
    'settle_sell_order', 'mark_sell_order_credited_usdt', 'expire_stale_sell_orders'
  ]
  loop
    select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;
    if v_count = 0 then
      raise exception 'SELL ORDER REGRESSION (0046): % has gone missing', v_name;
    end if;

    select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name
      and (
        has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
      );
    if v_count > 0 then
      raise exception 'SELL ORDER REGRESSION (0046): % is executable by a user session', v_name;
    end if;
  end loop;

  return true;
end;
$$;

revoke execute on function assert_sell_order_invariants() from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 7. A CLEAN APPLY IS THE VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  perform assert_phase1_invariants();
  perform assert_phase3_invariants();
  perform assert_phase4_invariants();
  perform assert_korapay_invariants();
  perform assert_korapay_payout_invariants();
  perform assert_treasury_invariants();
  perform assert_sell_order_invariants();
  raise notice 'Invariants hold, with sell orders included.';
end;
$$;

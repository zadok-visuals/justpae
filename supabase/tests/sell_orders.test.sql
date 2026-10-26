-- ============================================================================
-- GROUP — sell orders (migration 0046). Proves the two properties that
-- cannot be exercised by a fake in src/lib/sellOrders/sequence.test.ts
-- because they live in the database itself:
--
--   1. claim_sell_order_for_deposit is the exactly-once gate. A second call
--      for the same deposit — the webhook and the reconcile cron both
--      firing — finds nothing to claim and debits nothing a second time.
--   2. expire_stale_sell_orders moves an order nobody ever sent USDT to
--      into 'expired' once its window has passed, and a mismatch over 10%
--      is flagged without blocking the claim from proceeding.
--
-- Run with:   supabase test db          (needs Docker; runs every file here)
-- Against a remote database instead, if Docker is unavailable:
--   psql "$DATABASE_URL" -f supabase/tests/sell_orders.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

set local role postgres;

-- ── Fixtures: one user, a funded USDT wallet, an empty NGN wallet ─────────

insert into auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
values ('44444444-4444-4444-4444-444444444444', 'sellordertest@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now())
on conflict (id) do nothing;

insert into profiles (id, email, full_name, country)
values ('44444444-4444-4444-4444-444444444444', 'sellordertest@example.com', 'Sell Order Test', 'NG')
on conflict (id) do update set country = 'NG', suspended_at = null;

insert into wallets (user_id, currency, balance)
values
  ('44444444-4444-4444-4444-444444444444', 'USDT', 150),
  ('44444444-4444-4444-4444-444444444444', 'NGN', 0)
on conflict (user_id, currency) do update set balance = excluded.balance;

-- ── Order 1: already funded (as if credit_deposit just ran) ───────────────

insert into deposits (id, user_id, currency, amount, status, provider)
values ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444444', 'USDT', 50, 'completed', 'busha');

insert into sell_orders (
  id, user_id, target_currency, expected_usdt_amount, estimated_target_amount,
  provider_rate, markup_rate, customer_rate, status, deposit_id
)
values (
  '66666666-6666-6666-6666-666666666661', '44444444-4444-4444-4444-444444444444', 'NGN', 50, 75000,
  1500, 0.01, 1485, 'awaiting_deposit', '55555555-5555-5555-5555-555555555551'
);

select is(
  (select count(*)::int from claim_sell_order_for_deposit('55555555-5555-5555-5555-555555555551', 50)),
  1,
  'the first claim for a funded deposit returns exactly one row'
);

select is(
  (select status::text from sell_orders where id = '66666666-6666-6666-6666-666666666661'),
  'received',
  'the order moved to received'
);

select is(
  (select balance from wallets where user_id = '44444444-4444-4444-4444-444444444444' and currency = 'USDT'),
  100::numeric,
  'the received USDT was debited into a hold'
);

-- ── The webhook and the reconcile cron both fire for the same deposit ─────

select is(
  (select count(*)::int from claim_sell_order_for_deposit('55555555-5555-5555-5555-555555555551', 50)),
  0,
  'a second claim for the same deposit returns nothing — this is the exactly-once gate'
);

select is(
  (select balance from wallets where user_id = '44444444-4444-4444-4444-444444444444' and currency = 'USDT'),
  100::numeric,
  'the balance is not debited a second time'
);

-- ── Order 2: a mismatch over 10% is flagged but still proceeds ────────────

insert into deposits (id, user_id, currency, amount, status, provider)
values ('55555555-5555-5555-5555-555555555552', '44444444-4444-4444-4444-444444444444', 'USDT', 100, 'completed', 'busha');

insert into sell_orders (
  id, user_id, target_currency, expected_usdt_amount, estimated_target_amount,
  provider_rate, markup_rate, customer_rate, status, deposit_id
)
values (
  '66666666-6666-6666-6666-666666666662', '44444444-4444-4444-4444-444444444444', 'NGN', 100, 150000,
  1500, 0.01, 1485, 'awaiting_deposit', '55555555-5555-5555-5555-555555555552'
);

-- Only 50 actually arrived against an order opened for 100 — a 50% miss.
select is(
  (select count(*)::int from claim_sell_order_for_deposit('55555555-5555-5555-5555-555555555552', 50)),
  1,
  'a mismatched claim still returns a row — it must not be refused'
);

select is(
  (select flagged from sell_orders where id = '66666666-6666-6666-6666-666666666662'),
  true,
  'a mismatch over 10% is flagged'
);

-- ── Order 3: no deposit ever arrived, and its window has passed ───────────

insert into sell_orders (
  id, user_id, target_currency, expected_usdt_amount, estimated_target_amount,
  provider_rate, markup_rate, customer_rate, status, created_at
)
values (
  '66666666-6666-6666-6666-666666666663', '44444444-4444-4444-4444-444444444444', 'NGN', 20, 30000,
  1500, 0.01, 1485, 'awaiting_deposit', now() - interval '1 hour'
);

select expire_stale_sell_orders(interval '30 minutes');

select is(
  (select status::text from sell_orders where id = '66666666-6666-6666-6666-666666666663'),
  'expired',
  'an order with no deposit, past its window, moves to expired'
);

select * from finish();

rollback;

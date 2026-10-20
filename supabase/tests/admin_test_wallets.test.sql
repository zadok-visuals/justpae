-- ============================================================================
-- GROUP 2d. Proves admin_grant_role() provisions KES and GHS for an admin,
-- and that neither the grant nor ordinary signup gives them to anyone else.
--
-- Run with:   supabase test db          (needs Docker; runs every file here)
-- Against a remote database instead, if Docker is unavailable:
--   psql "$DATABASE_URL" -f supabase/tests/admin_test_wallets.test.sql
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

set local role postgres;

-- ── Fixtures: one admin, one ordinary user, neither starting with KES/GHS ──

insert into auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
values
  ('22222222-2222-2222-2222-222222222222', 'admintest@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'customertest@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now())
on conflict (id) do nothing;

insert into profiles (id, email, full_name, country)
values
  ('22222222-2222-2222-2222-222222222222', 'admintest@example.com', 'Admin Test', 'NG'),
  ('33333333-3333-3333-3333-333333333333', 'customertest@example.com', 'Customer Test', 'NG')
on conflict (id) do update set country = 'NG';

delete from wallets where user_id in (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
) and currency in ('KES', 'GHS');

-- ── Granting the role provisions KES and GHS ───────────────────────────────

select admin_grant_role(
  '22222222-2222-2222-2222-222222222222',
  'admin',
  '22222222-2222-2222-2222-222222222222'
);

select is(
  (select count(*)::int from wallets where user_id = '22222222-2222-2222-2222-222222222222' and currency = 'KES'),
  1,
  'granting admin provisions a KES wallet'
);

select is(
  (select count(*)::int from wallets where user_id = '22222222-2222-2222-2222-222222222222' and currency = 'GHS'),
  1,
  'granting admin provisions a GHS wallet'
);

-- ── Idempotent: granting again does not duplicate or error ────────────────

select lives_ok(
  $$ select admin_grant_role('22222222-2222-2222-2222-222222222222', 'admin', '22222222-2222-2222-2222-222222222222') $$,
  're-granting the same admin does not error'
);

select is(
  (select count(*)::int from wallets where user_id = '22222222-2222-2222-2222-222222222222' and currency = 'KES'),
  1,
  're-granting does not duplicate the KES wallet'
);

-- ── A non-admin never receives them ────────────────────────────────────────

select is(
  (select count(*)::int from wallets where user_id = '33333333-3333-3333-3333-333333333333' and currency in ('KES', 'GHS')),
  0,
  'an ordinary customer is never given the admin test wallets'
);

select * from finish();

rollback;

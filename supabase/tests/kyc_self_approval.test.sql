-- ============================================================================
-- Proves the 0011 fix: an authenticated user cannot approve their own
-- identity check, either on their profile row or on their documents.
--
-- Run with:   supabase test db          (needs Docker; runs every file here)
--
-- Against a remote database instead, if Docker is unavailable:
--   psql "$DATABASE_URL" -f supabase/tests/kyc_self_approval.test.sql
-- …inside a transaction that is rolled back — which is what the begin/rollback
-- around this file already does, so it leaves no trace either way.
--
-- WHAT IS BEING TESTED, and why it is tested at this layer: the hole in 0001
-- was not a missing check in application code, it was an RLS policy that
-- constrained rows but not columns. A TypeScript test cannot see that — it
-- would exercise the server action, which never tried to set kyc_status in the
-- first place. The only honest test is the one that does what an attacker does:
-- become the `authenticated` role with that user's JWT claims and write
-- directly to the table.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- ── Fixture ────────────────────────────────────────────────────────────────
-- A real auth.users row, because profiles.id references it and handle_new_user
-- is what normally creates the profile.
set local role postgres;

insert into auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
values (
  '11111111-1111-1111-1111-111111111111',
  'kyctest@example.com',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  '',
  now(),
  now()
)
on conflict (id) do nothing;

-- handle_new_user may or may not have populated this depending on whether the
-- trigger is present in the database under test; either way, land on a known
-- starting state.
insert into profiles (id, email, full_name, kyc_status, country)
values (
  '11111111-1111-1111-1111-111111111111',
  'kyctest@example.com',
  'Test User',
  'not_started',
  'NG'
)
on conflict (id) do update
set kyc_status = 'not_started',
    kyc_rejection_reason = null,
    full_name = 'Test User',
    country = 'NG';

insert into kyc_documents (user_id, tier, document_type, value, status)
values (
  '11111111-1111-1111-1111-111111111111',
  'individual_tier_2',
  'bvn',
  '12345678901',
  'pending'
)
on conflict (user_id, document_type) do update set status = 'pending';

-- ── Become the user ────────────────────────────────────────────────────────
-- Both halves matter: the role is what column grants are checked against, and
-- the JWT claims are what auth.uid() in the RLS policy and
-- is_end_user_request() in the trigger read.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"kyctest@example.com"}';

-- ── 1. The headline attack: self-approve KYC ───────────────────────────────
select throws_ok(
  $$ update profiles set kyc_status = 'approved' where id = '11111111-1111-1111-1111-111111111111' $$,
  null,
  null,
  'an authenticated user cannot set their own kyc_status to approved'
);

select throws_ok(
  $$ update profiles set kyc_status = 'pending' where id = '11111111-1111-1111-1111-111111111111' $$,
  null,
  null,
  'an authenticated user cannot set their own kyc_status at all, not even to pending'
);

-- ── 2. The adjacent columns ────────────────────────────────────────────────
select throws_ok(
  $$ update profiles set kyc_type = 'business' where id = '11111111-1111-1111-1111-111111111111' $$,
  null,
  null,
  'an authenticated user cannot change their own kyc_type'
);

select throws_ok(
  $$ update profiles set kyc_rejection_reason = null where id = '11111111-1111-1111-1111-111111111111' $$,
  null,
  null,
  'an authenticated user cannot clear their own kyc_rejection_reason'
);

select throws_ok(
  $$ update profiles set email = 'attacker@example.com' where id = '11111111-1111-1111-1111-111111111111' $$,
  null,
  null,
  'an authenticated user cannot change their own profile email'
);

select throws_ok(
  $$ update profiles set country = 'KE' where id = '11111111-1111-1111-1111-111111111111' $$,
  null,
  null,
  'an authenticated user cannot change their own country'
);

-- ── 3. What they legitimately still can do ─────────────────────────────────
-- A test that only proves things are blocked would pass just as well if the
-- table were revoked entirely, which would be an outage rather than a fix.
select lives_ok(
  $$ update profiles set phone = '+2348012345678' where id = '11111111-1111-1111-1111-111111111111' $$,
  'an authenticated user can still update their own phone number'
);

-- ── 4. kyc_documents cannot be self-approved ───────────────────────────────
-- The mechanism here is a forcing trigger rather than a raise: a status in the
-- payload is overwritten with 'pending'. So the assertion is on the resulting
-- value, not on an error.
update kyc_documents
set status = 'approved'
where user_id = '11111111-1111-1111-1111-111111111111' and document_type = 'bvn';

select is(
  (select status::text from kyc_documents
   where user_id = '11111111-1111-1111-1111-111111111111' and document_type = 'bvn'),
  'pending',
  'a kyc_documents status written by a user session is forced back to pending'
);

insert into kyc_documents (user_id, tier, document_type, value, status)
values (
  '11111111-1111-1111-1111-111111111111',
  'individual_tier_2',
  'selfie',
  'placeholder',
  'approved'
);

select is(
  (select status::text from kyc_documents
   where user_id = '11111111-1111-1111-1111-111111111111' and document_type = 'selfie'),
  'pending',
  'a kyc_documents row INSERTED as approved by a user session lands as pending'
);

-- ── 5. The PIN hash is no longer selectable (0012) ─────────────────────────
-- Same class of bug, same test shape, so it belongs in the same file: the
-- policy allowed the select and the client chose the columns.
select throws_ok(
  $$ select pin_hash from withdrawal_pins where user_id = '11111111-1111-1111-1111-111111111111' $$,
  null,
  null,
  'an authenticated user cannot select pin_hash from withdrawal_pins'
);

select * from finish();

rollback;

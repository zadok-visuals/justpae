-- ============================================================================
-- justpae 0019 — Phase 4: admin roles, the activity ledger, user suspension.
--
-- WHAT CHANGES, AND WHY THE README'S "ADMIN ROLES ARE DELIBERATELY ABSENT"
-- NOTE NO LONGER HOLDS.
--
-- Until now admin was an email allowlist in ADMIN_EMAILS, checked in
-- src/lib/auth/admin.ts. That was a defensible choice while the only admin
-- capability was approving KYC and completing payouts from a gated page, and
-- it had one real virtue: every admin_* function is revoked from `anon` and
-- `authenticated` and reachable only through the service-role client, so the
-- allowlist was never the ONLY thing standing between a user and the data.
--
-- It is not good enough now, for three concrete reasons:
--   1. Granting or removing an admin needs a redeploy, so in an incident the
--      fastest way to revoke a compromised admin is a Vercel env edit plus a
--      build. That is minutes, in the window where it matters most.
--   2. An env var has no history. There is no record of who granted admin to
--      whom, or when it was taken away — which is precisely the sort of thing
--      an audit asks for first.
--   3. Every admin is identical. "Can approve a KYC document" and "can grant
--      another person admin" are the same privilege, which means the blast
--      radius of one compromised admin account is the whole system.
--
-- So the database becomes the authority, with two roles. ADMIN_EMAILS SURVIVES
-- AS A BOOTSTRAP ONLY — see the note on admin_users below. It is kept
-- deliberately rather than dropped: a fresh project needs a first admin, and
-- the alternative is hand-writing a row into the dashboard's SQL editor, which
-- is both the thing the migrations README forbids and an unlogged change of
-- exactly the kind this migration exists to end.
-- ============================================================================

create type admin_role as enum ('admin', 'superadmin');

-- ── admin_users ────────────────────────────────────────────────────────────
-- The authority on who is an admin.
--
-- REVOKED RATHER THAN DELETED. A revoked grant stays as a row with
-- revoked_at set, because "X was an admin between these dates" is a fact an
-- investigation needs and a deleted row cannot answer. Every read filters on
-- revoked_at is null.
--
-- NO RLS POLICY AND NO GRANTS, on purpose. A user has no business reading the
-- admin roster: it is a list of the highest-value accounts in the system and
-- hands an attacker their target list. Every read goes through the service
-- role from an already-gated path, the same convention as withdrawal_pins and
-- conversion_quotes.
create table admin_users (
  user_id uuid primary key references profiles (id) on delete cascade,
  role admin_role not null default 'admin',
  granted_by uuid references profiles (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references profiles (id),
  /** Set when the row came from the ADMIN_EMAILS bootstrap rather than from a
      superadmin's grant, so the ledger can tell the two apart honestly. */
  bootstrapped boolean not null default false
);

create index admin_users_active_idx on admin_users (user_id) where revoked_at is null;

alter table admin_users enable row level security;
revoke all on admin_users from public, anon, authenticated;

-- ── admin_activity_log ─────────────────────────────────────────────────────
-- The ledger. Append-only: no update, no delete, for anyone including the
-- service role's own callers (there is no function here that mutates a row,
-- which is the only way to touch it).
--
-- An audit log an admin can edit is not an audit log. The most important
-- entries it will ever hold are the ones someone later wants gone.
create table admin_activity_log (
  id bigserial primary key,
  /** Nullable only because a profile deletion must not take the ledger with
      it — on delete set null, never cascade. An entry that says "someone did
      this" is worth keeping; losing the entry entirely is not. */
  admin_id uuid references profiles (id) on delete set null,
  /** Denormalised at write time, so the ledger still names the actor after the
      account is gone. */
  admin_email text,
  /** A short stable verb, e.g. 'kyc.approve', 'withdrawal.complete',
      'user.suspend', 'role.grant'. Checked for non-blank, not against an
      enum: a new admin capability must not need a migration to be auditable,
      and an unlogged action is far worse than an unfamiliar verb. */
  action text not null,
  target_type text,
  target_id text,
  /** Whatever makes the entry readable later — the rejection reason, the
      amount, the role granted. NEVER a PIN, a password, a token or a full
      account number: this table is read by every admin and dumped by every
      backup. */
  detail jsonb,
  created_at timestamptz not null default now(),
  constraint admin_activity_log_action_not_blank check (trim(action) <> '')
);

create index admin_activity_log_created_idx on admin_activity_log (created_at desc);
create index admin_activity_log_admin_idx on admin_activity_log (admin_id, created_at desc);
create index admin_activity_log_target_idx on admin_activity_log (target_type, target_id);

alter table admin_activity_log enable row level security;
revoke all on admin_activity_log from public, anon, authenticated;
-- bigserial creates a sequence, which is granted to PUBLIC by default and
-- would let a session burn ids. Harmless on its own, revoked for tidiness and
-- because "we never granted it" is not the same as "they cannot use it".
revoke all on sequence admin_activity_log_id_seq from public, anon, authenticated;

-- ── Suspension ─────────────────────────────────────────────────────────────
-- Three columns on profiles rather than a separate table: suspension is a
-- state OF the account, every read that cares already has the profile row in
-- hand, and a join table would make "is this user suspended" a second query on
-- the hottest path in the app.
--
-- These columns are NOT granted to any user session. Phase 1 revoked
-- table-wide UPDATE on profiles and granted only the `phone` column, so a
-- column added by ALTER TABLE here inherits nothing — which the standing
-- assertion at the bottom of this file verifies rather than assumes.
alter table profiles add column suspended_at timestamptz;
alter table profiles add column suspended_reason text;
alter table profiles add column suspended_by uuid references profiles (id);

create index profiles_suspended_idx on profiles (suspended_at) where suspended_at is not null;

-- ── Suspension that actually suspends ──────────────────────────────────────
-- THE DESIGN DECISION HERE IS THE WHOLE POINT OF THIS SECTION.
--
-- The obvious implementation is to check suspension in the app before calling
-- each money action, and/or to redirect a suspended session in the proxy. Both
-- of those are done too (they are what produces a decent error message), but
-- neither is the enforcement: a server action is reachable by POST whether or
-- not the page was gated, and the proxy is a matcher away from not running.
--
-- The second obvious implementation is to add a suspension check to the top of
-- create_withdrawal_request, create_conversion_from_quote and
-- create_bill_payment_from_quote. That is real enforcement, but it means
-- CREATE OR REPLACE on three large security-definer money functions — the
-- highest-risk files in this schema — to add one identical line to each, and
-- it silently fails to cover the NEXT money function somebody writes.
--
-- Instead: a trigger on the three tables every money movement must write to.
-- A withdrawal, a conversion and a bill payment all insert into `transactions`
-- or `bill_payments`; starting a deposit inserts into `deposits`. A trigger
-- fires for the service role and inside a security-definer function just the
-- same as for a user session — unlike RLS, which definer functions bypass —
-- so there is no way to move money around it, including from code that does
-- not know suspension exists.
--
-- INSERT ONLY, NEVER UPDATE. Crediting a deposit, completing a payout and
-- refunding a failed withdrawal are all UPDATEs, and all of them must keep
-- working for a suspended account: suspension must stop new activity, never
-- strand money that is already in flight. A suspension that swallowed an
-- in-flight refund would be indistinguishable from theft.
create function assert_user_not_suspended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suspended_at timestamptz;
begin
  select suspended_at into v_suspended_at
  from profiles
  where id = new.user_id;

  if v_suspended_at is not null then
    -- The message reaches the user through the action's error path, so it says
    -- what to do rather than naming the column.
    raise exception 'This account is suspended. Please contact support.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- A trigger function is still an ordinary entry in pg_proc, and Postgres
-- grants EXECUTE on a new function to PUBLIC by default. Calling it directly
-- would fail for want of a trigger context, but the rule this codebase follows
-- is that a server-only function is explicitly revoked rather than left
-- callable-but-useless — and the Phase 1 assertion enforces exactly that, so
-- omitting this line fails the migration. Same treatment 0014 gave
-- profiles_guard_protected_columns and kyc_documents_force_pending_status.
revoke execute on function assert_user_not_suspended() from public, anon, authenticated;

create trigger transactions_block_suspended
  before insert on transactions
  for each row execute function assert_user_not_suspended();

create trigger bill_payments_block_suspended
  before insert on bill_payments
  for each row execute function assert_user_not_suspended();

create trigger deposits_block_suspended
  before insert on deposits
  for each row execute function assert_user_not_suspended();

-- Defence in depth on the columns themselves, matching how 0011 treats
-- kyc_status: the column grants already stop these arriving in a user
-- session's payload, and this stops them changing however the write got here.
create or replace function profiles_guard_protected_columns()
returns trigger
language plpgsql
as $$
begin
  if not is_end_user_request() then
    return new;
  end if;

  if new.kyc_status is distinct from old.kyc_status then
    raise exception 'kyc_status cannot be changed from a user session';
  end if;

  if new.kyc_type is distinct from old.kyc_type then
    raise exception 'kyc_type cannot be changed from a user session';
  end if;

  if new.kyc_rejection_reason is distinct from old.kyc_rejection_reason then
    raise exception 'kyc_rejection_reason cannot be changed from a user session';
  end if;

  if new.email is distinct from old.email then
    raise exception 'email cannot be changed from a user session';
  end if;

  if new.country is distinct from old.country then
    raise exception 'country cannot be changed from a user session';
  end if;

  if new.id is distinct from old.id then
    raise exception 'id cannot be changed';
  end if;

  -- Phase 4. A user lifting their own suspension is the same class of hole as
  -- a user approving their own KYC, and it is the more valuable one: KYC
  -- self-approval opens withdrawals, self-unsuspension re-opens an account
  -- somebody deliberately closed.
  if new.suspended_at is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_by is distinct from old.suspended_by then
    raise exception 'suspension cannot be changed from a user session';
  end if;

  -- full_name is load-bearing beyond display: set_withdrawal_recipient and
  -- confirm_recipient_change both compare the payout account holder name
  -- against it, and that comparison is the only thing stopping a payout to a
  -- third party. Once a submission is in review or approved, the name is the
  -- name on the reviewed ID and is frozen.
  if new.full_name is distinct from old.full_name
     and old.kyc_status in ('pending', 'approved') then
    raise exception 'Your name is locked while your identity check is in review or approved. Contact support to change it.';
  end if;

  return new;
end;
$$;

-- ── The ledger writer ──────────────────────────────────────────────────────
-- Every admin_* function below ends by calling this, and the server actions
-- call it for the ones that do not go through a function of their own.
create function admin_log_activity(
  p_admin_id uuid,
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_detail jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_email text;
begin
  select email into v_email from profiles where id = p_admin_id;

  insert into admin_activity_log (admin_id, admin_email, action, target_type, target_id, detail)
  values (p_admin_id, v_email, trim(p_action), p_target_type, p_target_id, p_detail)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function admin_log_activity(uuid, text, text, text, jsonb)
  from public, anon, authenticated;

-- ── Roles ──────────────────────────────────────────────────────────────────
-- Returns the caller's role or null. Service-role only: this is called from
-- requireAdminUser, which already holds that client.
create function admin_role_for(p_user_id uuid)
returns admin_role
language sql
stable
security definer
set search_path = public
as $$
  select role from admin_users
  where user_id = p_user_id and revoked_at is null;
$$;

revoke execute on function admin_role_for(uuid) from public, anon, authenticated;

/**
 * The ADMIN_EMAILS bootstrap, called once per admin sign-in from
 * requireAdminUser when the allowlist says yes and admin_users says nothing.
 *
 * It grants 'superadmin', because the person holding the deploy environment
 * can already change anything, and pretending otherwise would be security
 * theatre. It marks the row `bootstrapped` so the ledger never claims a human
 * granted it, and it is a no-op once a row exists — including a REVOKED row,
 * which is the important case: an admin removed through the UI must not come
 * back at their next sign-in just because their address is still sitting in an
 * env var somebody forgot to edit. Revocation is the stronger statement and it
 * wins.
 */
create function admin_bootstrap_role(p_user_id uuid)
returns admin_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role admin_role;
begin
  select role into v_role from admin_users where user_id = p_user_id;
  if found then
    -- A row exists, revoked or not. Never resurrect, never upgrade.
    return (select role from admin_users where user_id = p_user_id and revoked_at is null);
  end if;

  insert into admin_users (user_id, role, granted_by, bootstrapped)
  values (p_user_id, 'superadmin', null, true)
  returning role into v_role;

  perform admin_log_activity(
    p_user_id,
    'role.bootstrap',
    'user',
    p_user_id::text,
    jsonb_build_object('role', 'superadmin', 'source', 'ADMIN_EMAILS')
  );

  return v_role;
end;
$$;

revoke execute on function admin_bootstrap_role(uuid) from public, anon, authenticated;

/**
 * Grant or re-grant. Superadmin-gated in the action, not here: this function
 * is unreachable without the service role, and duplicating the role check in
 * SQL would mean two places to keep in step.
 *
 * An existing revoked row is UPDATED rather than inserted alongside, so the
 * primary key stays one row per user and the grant/revoke history lives in the
 * ledger — which is the thing designed to hold history, with one entry per
 * event rather than a table that can only ever remember the latest.
 */
create function admin_grant_role(
  p_user_id uuid,
  p_role admin_role,
  p_granted_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into admin_users (user_id, role, granted_by, granted_at, bootstrapped)
  values (p_user_id, p_role, p_granted_by, now(), false)
  on conflict (user_id) do update set
    role = excluded.role,
    granted_by = excluded.granted_by,
    granted_at = now(),
    bootstrapped = false,
    revoked_at = null,
    revoked_by = null;

  perform admin_log_activity(
    p_granted_by,
    'role.grant',
    'user',
    p_user_id::text,
    jsonb_build_object('role', p_role)
  );
end;
$$;

revoke execute on function admin_grant_role(uuid, admin_role, uuid)
  from public, anon, authenticated;

create function admin_revoke_role(p_user_id uuid, p_revoked_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A superadmin removing their own access would lock the last one out with no
  -- way back except the env-var bootstrap, which admin_bootstrap_role
  -- deliberately will not honour for a revoked row. Refused here rather than
  -- only in the UI, because the UI is not the gate.
  if p_user_id = p_revoked_by then
    raise exception 'You cannot revoke your own admin access.';
  end if;

  update admin_users
  set revoked_at = now(), revoked_by = p_revoked_by
  where user_id = p_user_id and revoked_at is null;

  if found then
    perform admin_log_activity(p_revoked_by, 'role.revoke', 'user', p_user_id::text, null);
  end if;
end;
$$;

revoke execute on function admin_revoke_role(uuid, uuid) from public, anon, authenticated;

-- ── Suspend / reinstate ────────────────────────────────────────────────────
create function admin_suspend_user(
  p_user_id uuid,
  p_reason text,
  p_suspended_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A suspension reason is required.';
  end if;

  -- Suspending an admin would leave them holding admin access on a closed
  -- account. Revoke first, deliberately, so there is no state where those two
  -- disagree.
  if exists (select 1 from admin_users where user_id = p_user_id and revoked_at is null) then
    raise exception 'Revoke this account''s admin access before suspending it.';
  end if;

  update profiles
  set suspended_at = now(),
      suspended_reason = trim(p_reason),
      suspended_by = p_suspended_by
  where id = p_user_id;

  if not found then
    raise exception 'No such account.';
  end if;

  perform admin_log_activity(
    p_suspended_by,
    'user.suspend',
    'user',
    p_user_id::text,
    jsonb_build_object('reason', trim(p_reason))
  );
end;
$$;

revoke execute on function admin_suspend_user(uuid, text, uuid) from public, anon, authenticated;

create function admin_unsuspend_user(p_user_id uuid, p_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set suspended_at = null, suspended_reason = null, suspended_by = null
  where id = p_user_id and suspended_at is not null;

  if found then
    perform admin_log_activity(p_by, 'user.reinstate', 'user', p_user_id::text, null);
  end if;
end;
$$;

revoke execute on function admin_unsuspend_user(uuid, uuid) from public, anon, authenticated;

-- ── Dashboard statistics ───────────────────────────────────────────────────
/**
 * The admin dashboard's real numbers, in one round trip.
 *
 * A function rather than a dozen head-count selects from the page because each
 * of those is a separate HTTP request to PostgREST, and because a count that
 * is cheap in SQL ("sum of completed withdrawal volume in the last 7 days")
 * becomes either a full-table download or a hand-rolled aggregate in
 * TypeScript otherwise.
 *
 * EVERY FIGURE HERE IS COUNTED FROM THE TABLES. There is no seeded,
 * placeholder or illustrative number anywhere in it — a dashboard that shows a
 * made-up figure is worse than one that shows none, because somebody will make
 * a decision on it.
 */
create function admin_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'users_total', (select count(*) from profiles),
    'users_new_7d', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'users_suspended', (select count(*) from profiles where suspended_at is not null),
    'kyc_pending', (select count(*) from profiles where kyc_status = 'pending'),
    'kyc_approved', (select count(*) from profiles where kyc_status = 'approved'),
    'withdrawals_queued', (
      select count(*) from transactions
      where type = 'withdrawal' and status in ('pending', 'processing')
    ),
    'withdrawals_flagged', (
      select count(*) from transactions
      where type = 'withdrawal' and requires_extra_verification
        and extra_verification_confirmed_at is null
    ),
    'automation_failed', (
      select count(*) from transactions
      where type = 'withdrawal' and status = 'pending'
        and automated_payout_attempt_failed_reason is not null
    ),
    'manual_review', (select count(*) from transactions where needs_manual_review),
    'deposits_pending', (select count(*) from deposits where status = 'pending'),
    'transactions_7d', (
      select count(*) from transactions where created_at > now() - interval '7 days'
    ),
    'transactions_completed_7d', (
      select count(*) from transactions
      where status = 'completed' and created_at > now() - interval '7 days'
    ),
    'support_unread', (
      select count(*) from support_messages where sender = 'user' and read_at is null
    ),
    'support_threads', (select count(distinct user_id) from support_messages),
    'admins_active', (select count(*) from admin_users where revoked_at is null)
  );
$$;

revoke execute on function admin_dashboard_stats() from public, anon, authenticated;

-- ── Phase 4 invariants ─────────────────────────────────────────────────────
create function assert_phase4_invariants()
returns boolean
language plpgsql
as $$
declare
  v_offenders text;
  v_count integer;
begin
  -- The admin roster and the ledger must be unreachable from a user session,
  -- at every privilege. These are the two tables that name the highest-value
  -- accounts in the system and record what they did.
  select string_agg(distinct table_name || ':' || privilege_type, ', ') into v_offenders
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('admin_users', 'admin_activity_log')
    and grantee in ('authenticated', 'anon', 'PUBLIC');

  if v_offenders is not null then
    raise exception 'PHASE 4 REGRESSION: a user session holds % — the admin roster is an attacker''s target list and the ledger is evidence.', v_offenders;
  end if;

  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename in ('admin_users', 'admin_activity_log');

  if v_count > 0 then
    raise exception 'PHASE 4 REGRESSION: admin_users/admin_activity_log have % RLS policy/policies and must have none — every read goes through the service role.', v_count;
  end if;

  -- The ledger must be append-only. An UPDATE or DELETE path, by any route,
  -- defeats the entire point: the entries worth deleting are exactly the ones
  -- somebody will want deleted.
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      -- This function's own body contains the pattern as a string literal.
      -- The regex does not actually match it (nothing in '(update|delete)\s+'
      -- is "update" followed by whitespace), but excluding the checker from
      -- its own check is the difference between that being true and being
      -- true by luck.
      and p.proname <> 'assert_phase4_invariants'
      and p.prosrc ~* '(update|delete)\s+(from\s+)?admin_activity_log'
  ) then
    raise exception 'PHASE 4 REGRESSION: a function mutates admin_activity_log. The ledger is append-only.';
  end if;

  -- Suspension must not be self-serve.
  select string_agg(c.column_name, ', ') into v_offenders
  from information_schema.column_privileges c
  where c.table_schema = 'public' and c.table_name = 'profiles'
    and c.privilege_type = 'UPDATE'
    and c.grantee in ('authenticated', 'anon', 'PUBLIC')
    and c.column_name in ('suspended_at', 'suspended_reason', 'suspended_by');

  if v_offenders is not null then
    raise exception 'PHASE 4 REGRESSION: a user session can UPDATE profiles.% — an account could lift its own suspension.', v_offenders;
  end if;

  -- And the triggers that make suspension mean something must exist. Without
  -- all three, a suspended account can still move money through whichever
  -- table is unguarded.
  select string_agg(t.name, ', ') into v_offenders
  from unnest(array[
    'transactions_block_suspended',
    'bill_payments_block_suspended',
    'deposits_block_suspended'
  ]) as t(name)
  where not exists (
    select 1 from pg_trigger where tgname = t.name and not tgisinternal
  );

  if v_offenders is not null then
    raise exception 'PHASE 4 REGRESSION: these suspension triggers are missing: %. Suspension is advisory without them.', v_offenders;
  end if;

  return true;
end;
$$;

grant execute on function assert_phase4_invariants() to authenticated;

-- assert_phase1_invariants asserts that nothing outside its allowlist is
-- executable by a user session. This migration adds eight functions, seven of
-- which are revoked; assert_phase4_invariants is the exception and is added to
-- the allowlist, for the same reason the other two assertions are: it reports
-- configuration and moves nothing.
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
    -- Phase 4 — reports configuration, moves nothing, takes no arguments
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
    raise exception 'PHASE 1 REGRESSION: these functions were dropped for taking caller-supplied money values and have come back: %', v_offenders;
  end if;

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

  if not exists (
    select 1 from pg_trigger where tgname = 'profiles_guard_protected_columns' and not tgisinternal
  ) then
    raise exception 'PHASE 1 REGRESSION (1.2): the profiles_guard_protected_columns trigger is missing.';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'kyc_documents_force_pending_status' and not tgisinternal
  ) then
    raise exception 'PHASE 1 REGRESSION (1.2): the kyc_documents_force_pending_status trigger is missing.';
  end if;

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

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'withdrawal_pins'
      and column_name in ('failed_attempts', 'locked_until')
    group by table_name having count(*) = 2
  ) then
    raise exception 'PHASE 1 REGRESSION (1.4b): withdrawal_pins is missing failed_attempts and/or locked_until.';
  end if;

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

grant execute on function assert_phase1_invariants() to authenticated;

do $$
begin
  perform assert_phase1_invariants();
  perform assert_phase3_invariants();
  perform assert_phase4_invariants();
  raise notice 'Phase 1, 3 and 4 invariants hold.';
end;
$$;

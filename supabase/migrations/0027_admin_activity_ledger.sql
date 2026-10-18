-- ============================================================================
-- justpae 0027 — one ledger an operator can search, and a guard on roles.
--
-- Two unrelated read-side gaps, in one migration because both are small.
-- Neither moves money and neither grants anything to a user session.
--
--   1. admin_activity_ledger — every money movement in this product, from
--      three tables, as one queryable list with the user attached.
--   2. admin_revoke_role — refuse to remove the last superadmin.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1. THE LEDGER
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY A VIEW AND NOT FOUR QUERIES IN THE PAGE. Money leaves this product
-- through four tables — transactions (conversions, withdrawals, Pay to
-- China), deposits, and bill_payments — and an operator asked "what happened
-- on this account" does not care which. Four queries in a server component
-- cannot be paged together: page 2 of four separately-paged lists is not page
-- 2 of anything. Sorting and paging have to happen after the union, which
-- means the union has to be in the database.
--
-- WHY THE USER IS JOINED IN HERE. The admin transactions page shows an email
-- on every row. Fetching rows and then fetching profiles for them is an N+1
-- that also cannot be filtered on — "show me everything for alice@" needs the
-- email in the WHERE clause, not in a second pass.
--
-- SECURITY. Revoked from public, anon and authenticated, exactly like every
-- other admin-only object here: it is read with the service role from an
-- admin-gated server component. It is additionally declared
-- `security_invoker = true`, which is defence in depth rather than the
-- control: a view defaults to running with its OWNER's rights, so a future
-- accidental `grant select ... to authenticated` on a default view would hand
-- every user every other user's transactions in one statement. With
-- security_invoker on, that same mistake exposes only what the caller's own
-- RLS policies already allow — their own rows. The grant is still the thing
-- that must not happen; this is what makes it survivable.
--
-- `source` is part of the identity of a row, not decoration: ids are unique
-- per table, not across them, so (source, id) is what the page keys on.

create view admin_activity_ledger
with (security_invoker = true)
as
  select
    'transaction'::text          as source,
    t.id,
    t.user_id,
    p.email                      as user_email,
    p.full_name                  as user_name,
    t.type::text                 as kind,
    t.status::text               as status,
    t.currency::text             as currency,
    t.amount,
    t.target_currency::text      as target_currency,
    -- What the customer ACTUALLY got where that is known, falling back to
    -- what was quoted. A Pay to China request settled for a different figure
    -- than it quoted should read as the figure it settled for.
    coalesce(t.actual_target_amount, t.target_amount) as target_amount,
    t.fee,
    t.provider::text             as provider,
    t.provider_reference         as reference,
    t.decline_reason,
    t.created_at
  from transactions t
  join profiles p on p.id = t.user_id

  union all

  select
    'deposit'::text,
    d.id,
    d.user_id,
    p.email,
    p.full_name,
    'deposit'::text,
    d.status::text,
    d.currency::text,
    -- confirmed_amount over amount for the same reason as above: a user who
    -- requested a 10 USDT deposit and sent 12 on-chain deposited 12.
    coalesce(d.confirmed_amount, d.amount),
    null::text,
    null::numeric,
    null::numeric,
    d.provider::text,
    d.provider_reference,
    d.decline_reason,
    d.created_at
  from deposits d
  join profiles p on p.id = d.user_id

  union all

  select
    'bill'::text,
    b.id,
    b.user_id,
    p.email,
    p.full_name,
    'bill_' || b.category::text,
    b.status::text,
    b.currency::text,
    b.amount,
    null::text,
    null::numeric,
    b.fee,
    b.provider,
    b.provider_reference,
    b.decline_reason,
    b.created_at
  from bill_payments b
  join profiles p on p.id = b.user_id;

revoke all on admin_activity_ledger from public, anon, authenticated;

-- The ledger is always read newest-first and almost always filtered by user,
-- status or kind. The underlying per-table indexes on (user_id, created_at
-- desc) already exist from 0001 and 0008; what was missing was a plain
-- created_at index on each, which is what an unfiltered first page sorts by.
create index if not exists transactions_created_idx on transactions (created_at desc);
create index if not exists deposits_created_idx on deposits (created_at desc);
create index if not exists bill_payments_created_idx on bill_payments (created_at desc);

-- Reference lookup is the other access path: an operator pastes a provider
-- reference a customer quoted and expects one row back.
create index if not exists transactions_reference_idx on transactions (provider_reference)
  where provider_reference is not null;
create index if not exists deposits_reference_idx on deposits (provider_reference)
  where provider_reference is not null;
create index if not exists bill_payments_reference_idx on bill_payments (provider_reference)
  where provider_reference is not null;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. THE LAST SUPERADMIN
-- ════════════════════════════════════════════════════════════════════════════
--
-- 0019's admin_revoke_role already refuses self-revocation, which is the
-- guard against the obvious mistake. It does not refuse removing the LAST
-- superadmin, which is the guard against the unrecoverable one: two
-- superadmins who each remove the other, or one superadmin removed by a
-- colleague, leaves an installation where nobody can grant a role again and
-- the only way back in is a hand-written SQL statement against production.
--
-- IN SQL, NOT IN THE UI. The reference implementation disables the button.
-- A disabled button is a courtesy, not a control — the server action behind
-- it is reachable by POST regardless, and this is a function whose whole
-- purpose is to be called by someone with enough privilege to call it.
--
-- "LAST" MEANS LAST ACTIVE. A revoked row stays in admin_users as history, so
-- the count has to carry `revoked_at is null` or a installation that has ever
-- demoted a superadmin reads as having several and the guard never fires.
--
-- The target row is locked with `for update` BEFORE the count is taken, so two
-- superadmins revoking each other concurrently cannot both see a count of two
-- and both proceed. Without the lock that race ends with zero superadmins,
-- which is precisely the state this exists to prevent.
--
-- Everything else is 0019's function unchanged: the same soft delete (a
-- revocation is history, not an erasure), the same self-revocation refusal,
-- the same ledger entry, and the same parameter names — renaming an argument
-- on `create or replace` is an error, and the names are part of the signature
-- the server action calls by.

create or replace function admin_revoke_role(p_user_id uuid, p_revoked_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role admin_role;
  v_superadmin_count integer;
begin
  -- A superadmin removing their own access would lock the last one out with no
  -- way back except the env-var bootstrap, which admin_bootstrap_role
  -- deliberately will not honour for a revoked row. Refused here rather than
  -- only in the UI, because the UI is not the gate.
  if p_user_id = p_revoked_by then
    raise exception 'You cannot revoke your own admin access.';
  end if;

  select role into v_target_role
  from admin_users
  where user_id = p_user_id and revoked_at is null
  for update;

  -- Still a no-op when the target is not an active admin, exactly as before:
  -- `update ... where revoked_at is null` matched nothing and `found` was
  -- false. Revoking an already-revoked admin is not an error worth raising.
  if v_target_role is null then
    return;
  end if;

  if v_target_role = 'superadmin' then
    select count(*) into v_superadmin_count
    from admin_users
    where role = 'superadmin' and revoked_at is null;

    if v_superadmin_count <= 1 then
      raise exception
        'That is the last superadmin. Grant superadmin to another account first, then revoke this one.';
    end if;
  end if;

  update admin_users
  set revoked_at = now(), revoked_by = p_revoked_by
  where user_id = p_user_id and revoked_at is null;

  perform admin_log_activity(p_revoked_by, 'role.revoke', 'user', p_user_id::text, null);
end;
$$;

revoke execute on function admin_revoke_role(uuid, uuid) from public, anon, authenticated;



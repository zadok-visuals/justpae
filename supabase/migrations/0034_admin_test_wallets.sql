-- ============================================================================
-- GROUP 2d — admins get a KES and a GHS wallet, in addition to their own.
--
-- WHY. An admin signed up the same way any customer did, so an admin whose
-- country is Nigeria has never been able to see what a Kenyan customer sees,
-- or test a GHS flow at all, without a second real account. Granting the
-- role is the one event that marks someone as needing to exercise every
-- corridor, not just their own country's.
--
-- CUSTOMERS KEEP ONLY THE WALLETS THEIR COUNTRY GIVES THEM — this function is
-- called ONLY from the two role-granting paths below, never from
-- handle_new_user(), so signing up never provisions these two extra wallets
-- for anyone who isn't already an admin.
-- ============================================================================

create function admin_provision_test_wallets(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into wallets (user_id, currency)
  values (p_user_id, 'KES'), (p_user_id, 'GHS')
  on conflict (user_id, currency) do nothing;
$$;

revoke execute on function admin_provision_test_wallets(uuid) from public, anon, authenticated;

-- ── Re-created with the one added line, bodies otherwise unchanged from 0019 ─

create or replace function admin_bootstrap_role(p_user_id uuid)
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
    return (select role from admin_users where user_id = p_user_id and revoked_at is null);
  end if;

  insert into admin_users (user_id, role, granted_by, bootstrapped)
  values (p_user_id, 'superadmin', null, true)
  returning role into v_role;

  perform admin_provision_test_wallets(p_user_id);

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

create or replace function admin_grant_role(
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

  perform admin_provision_test_wallets(p_user_id);

  perform admin_log_activity(
    p_granted_by,
    'role.grant',
    'user',
    p_user_id::text,
    jsonb_build_object('role', p_role)
  );
end;
$$;

-- ── One-time backfill for every admin already granted before this migration ─
select admin_provision_test_wallets(user_id) from admin_users where revoked_at is null;

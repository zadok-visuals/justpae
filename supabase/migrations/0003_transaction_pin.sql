-- ============================================================================
-- justpae 0003 — the transaction PIN.
--
-- A PIN separate from the account login password authorises every money-out
-- action: conversions, withdrawals and bill payments. It is checked INSIDE the
-- Postgres function that moves the balance, not in the UI — a UI-only PIN
-- prompt is bypassed by calling the RPC directly.
--
-- The table keeps the name `withdrawal_pins` from the architecture this is
-- built on even though the PIN now gates three flows rather than one, because
-- the column, function and type names are already threaded through the client
-- contract. It is one PIN per user either way.
-- ============================================================================

create table withdrawal_pins (
  user_id uuid primary key references profiles (id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table withdrawal_pins enable row level security;

-- The owner can see that a row exists (so Settings renders "set up a PIN" vs
-- "PIN is set"). The app never selects pin_hash back to a client even though
-- the policy would allow it; verification happens server-side only.
create policy "withdrawal_pins: read own"
  on withdrawal_pins for select
  using (auth.uid() = user_id);

-- First-time setup only. Raises if a PIN already exists — changing one goes
-- through change_withdrawal_pin below, which the TS layer only reaches after
-- re-verifying the account password.
create function set_withdrawal_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from withdrawal_pins where user_id = v_user_id) then
    raise exception 'A transaction PIN is already set.';
  end if;

  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;

  insert into withdrawal_pins (user_id, pin_hash)
  values (v_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf')));
end;
$$;

grant execute on function set_withdrawal_pin(text) to authenticated;

-- A Postgres function cannot verify a Supabase Auth password hash, so the
-- password re-check happens in the TS action (changeTransactionPin) via
-- signInWithPassword immediately before this is called. This function
-- therefore needs no old-PIN check — only confirmation that a row exists, so
-- it can never be used as an unauthenticated first-time setup path.
create function change_withdrawal_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from withdrawal_pins where user_id = v_user_id) then
    raise exception 'No transaction PIN is set yet';
  end if;

  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;

  update withdrawal_pins
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      updated_at = now()
  where user_id = v_user_id;
end;
$$;

grant execute on function change_withdrawal_pin(text) to authenticated;

-- Shared PIN verification, used by create_conversion, create_withdrawal_request
-- and create_bill_payment. Raises rather than returning false so no caller can
-- forget to check the result.
create function verify_transaction_pin(p_user_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin_hash text;
begin
  select pin_hash into v_pin_hash from withdrawal_pins where user_id = p_user_id;

  if v_pin_hash is null then
    raise exception 'Set a transaction PIN in Settings first';
  end if;

  if extensions.crypt(p_pin, v_pin_hash) <> v_pin_hash then
    raise exception 'Incorrect transaction PIN';
  end if;
end;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, so "we never
-- granted it" is NOT the same as "a session cannot call it". Every function
-- that only server code may invoke is explicitly revoked, here and in every
-- later migration. For this one it matters most of all: left callable, it is an
-- unthrottled PIN oracle.
revoke execute on function verify_transaction_pin(uuid, text) from public, anon, authenticated;

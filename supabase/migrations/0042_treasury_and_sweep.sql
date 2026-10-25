-- ============================================================================
-- justpae 0042 — the treasury: where the company's own money is, and the one
-- table that records it moving.
--
-- ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
--
-- Customer deposits land in one provider's balance and customer withdrawals
-- leave from another's. Nothing in the app has ever recorded the transfers in
-- between, so "do we have enough naira to pay tomorrow's withdrawals" has
-- been a question answered by logging into two dashboards. treasury_movements
-- is the ledger of those transfers — the manual ones an operator types in and
-- the automatic sweeps — and it is deliberately SEPARATE from `transactions`:
-- nothing in here is a customer's money, and a company transfer sitting in
-- the same table as customer orders would be counted as one by every report
-- that exists.
--
-- ── THE RULE THIS FILE ENFORCES ────────────────────────────────────────────
--
-- A SWEEP RUNS ONCE. Not by reading the table and deciding — two cron runs a
-- second apart would both read "nothing yet" — but by inserting under a
-- unique index on `reference` and acting only if the insert won. Same shape
-- as credit_korapay_deposit in 0040 and claim_payout_attempt in 0041, for the
-- same reason.
--
-- ── SECURITY ───────────────────────────────────────────────────────────────
--
-- treasury_movements has RLS on and NO policies at all. It is not customer
-- data and no customer session has any business reading the company's bank
-- balances; the admin screen reads it through the service role. Every
-- function here is security definer with a pinned search_path and revoked
-- from public, anon and authenticated.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1. THE LEDGER
-- ════════════════════════════════════════════════════════════════════════════

create table treasury_movements (
  id uuid primary key default gen_random_uuid(),
  -- When the money actually moved, which is not always when the row was
  -- written: an operator records yesterday's transfer today.
  occurred_on date not null default current_date,
  currency currency not null,
  amount numeric(18, 2) not null check (amount > 0),
  -- Free text on purpose. The accounts money moves between are a provider
  -- balance, a company bank account and whatever the business adds next; an
  -- enum here would need a migration every time the treasury changes shape.
  from_account text not null,
  to_account text not null,
  -- THE IDEMPOTENCY KEY. A sweep's reference is derived from its date, so a
  -- second run of the same day's sweep loses the insert instead of sending a
  -- second transfer.
  reference text not null,
  -- 'manual' or 'automatic'. Not a boolean: an operator reading this table
  -- wants to see the word.
  source text not null default 'manual' check (source in ('manual', 'automatic')),
  status text not null default 'recorded' check (status in ('recorded', 'sent', 'failed')),
  -- The provider's own reference for the transfer, once there is one.
  provider_reference text,
  note text,
  -- Null for an automatic sweep: nobody pressed anything.
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create unique index treasury_movements_reference_idx on treasury_movements (reference);
create index treasury_movements_occurred_idx on treasury_movements (occurred_on desc);

-- Supabase grants every new public table to anon and authenticated by
-- default. Taken away wholesale and handed nothing back: this table has no
-- customer-facing reader at all.
revoke all on table treasury_movements from public, anon, authenticated;

alter table treasury_movements enable row level security;

comment on table treasury_movements is
  'Company money moving between provider balances and bank accounts. No '
  'customer balance is ever touched by a row in here. Service role only.';


-- ════════════════════════════════════════════════════════════════════════════
-- 2. RECORDING ONE
-- ════════════════════════════════════════════════════════════════════════════
--
-- Returns the row, or NULL when the reference already exists. The null is the
-- whole point: the sweep calls this BEFORE it sends anything, and only a
-- non-null answer is permission to call the provider.

create function record_treasury_movement(
  p_currency currency,
  p_amount numeric,
  p_from_account text,
  p_to_account text,
  p_reference text,
  p_source text default 'manual',
  p_occurred_on date default current_date,
  p_note text default null,
  p_created_by uuid default null
)
returns treasury_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row treasury_movements;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'A treasury movement needs a positive amount.';
  end if;
  if p_reference is null or p_reference = '' then
    raise exception 'A treasury movement needs a reference.';
  end if;
  if coalesce(trim(p_from_account), '') = '' or coalesce(trim(p_to_account), '') = '' then
    raise exception 'A treasury movement needs both ends of the transfer.';
  end if;

  insert into treasury_movements (
    currency, amount, from_account, to_account, reference, source, occurred_on, note, created_by
  )
  values (
    p_currency, p_amount, trim(p_from_account), trim(p_to_account), p_reference,
    p_source, coalesce(p_occurred_on, current_date), p_note, p_created_by
  )
  on conflict (reference) do nothing
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function record_treasury_movement(currency, numeric, text, text, text, text, date, text, uuid)
  from public, anon, authenticated;

/** The provider answered. Only ever called about a movement we just wrote. */
create function settle_treasury_movement(
  p_reference text,
  p_status text,
  p_provider_reference text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'A treasury movement settles as sent or failed.';
  end if;

  update treasury_movements
  set status = p_status,
      provider_reference = coalesce(p_provider_reference, provider_reference)
  where reference = p_reference;
end;
$$;

revoke execute on function settle_treasury_movement(text, text, text)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. WHAT WE OWE CUSTOMERS
-- ════════════════════════════════════════════════════════════════════════════
--
-- The other half of the treasury page. A provider balance means nothing on
-- its own; it is only safe or unsafe relative to the sum of what customers
-- could ask for.

create function admin_wallet_liabilities()
returns table (currency currency, total numeric)
language sql
security definer
set search_path = public
as $$
  select w.currency, coalesce(sum(w.balance), 0)::numeric as total
  from wallets w
  group by w.currency
  order by w.currency;
$$;

revoke execute on function admin_wallet_liabilities() from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. THE SWEEP SETTINGS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Seeded empty where they are an account detail, because a sweep with a
-- guessed destination is the worst possible default. The sweep refuses to run
-- until all three account fields are set.
--
-- sweep_paused_until is written by admin_set_sweep_account below rather than
-- by an operator: the pause is a consequence of changing the destination, not
-- a dial.

insert into app_settings (key, value, description) values
  ('sweep_funding_bank_code', '', 'Bank code of the payout funding account the daily sweep sends to. Resolved and confirmed before it is saved.'),
  ('sweep_funding_account_number', '', 'Account number of the payout funding account the daily sweep sends to.'),
  ('sweep_funding_account_name', '', 'The name the bank returned for the sweep funding account. Recorded when the account is saved, not typed.'),
  ('sweep_min_keep_ngn', '500000', 'Naira to leave in the deposit balance for payouts. The sweep never takes it below this.'),
  ('sweep_target_payout_ngn', '2000000', 'Naira the payout balance should hold. The sweep tops it up to here and no further.'),
  ('sweep_max_daily_ngn', '1000000', 'The most the sweep may move in one day, automatic and manual runs together.'),
  ('sweep_time_lagos', '17:30', 'Local Lagos time the daily sweep runs, as HH:MM.'),
  ('sweep_paused_until', '', 'Set automatically for 24 hours when the sweep destination changes. The sweep does not run before this.')
on conflict (key) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. CHANGING WHERE THE SWEEP SENDS
-- ════════════════════════════════════════════════════════════════════════════
--
-- One function rather than three admin_set_setting calls, because the three
-- fields and the pause have to move together. A destination half-written — a
-- new account number against an old bank code — is an account that exists and
-- is not the one anybody intended.
--
-- THE 24-HOUR PAUSE IS NOT A COURTESY. Changing this destination is the
-- single highest-value action in the admin surface: it redirects the
-- company's own money. The MFA gate in requireAdminUser stops a stolen
-- session; the pause is what puts a day between the change and the first
-- automatic transfer, which is the only thing that gives a human time to
-- notice. It is written HERE rather than in the server action so it cannot
-- be skipped by a second caller.

create function admin_set_sweep_account(
  p_bank_code text,
  p_account_number text,
  p_account_name text,
  p_admin_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paused_until timestamptz := now() + interval '24 hours';
begin
  if coalesce(trim(p_bank_code), '') = ''
     or coalesce(trim(p_account_number), '') = ''
     or coalesce(trim(p_account_name), '') = '' then
    raise exception 'A sweep destination needs a bank code, an account number and the name the bank returned.';
  end if;
  if p_admin_id is null then
    raise exception 'A sweep destination change must name the admin who made it.';
  end if;

  perform admin_set_setting('sweep_funding_bank_code', trim(p_bank_code), p_admin_id);
  perform admin_set_setting('sweep_funding_account_number', trim(p_account_number), p_admin_id);
  perform admin_set_setting('sweep_funding_account_name', trim(p_account_name), p_admin_id);
  perform admin_set_setting('sweep_paused_until', v_paused_until::text, p_admin_id);

  return v_paused_until;
end;
$$;

revoke execute on function admin_set_sweep_account(text, text, text, uuid)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. INVARIANTS
-- ════════════════════════════════════════════════════════════════════════════

create function assert_treasury_invariants()
returns boolean
language plpgsql
as $$
declare
  v_name text;
  v_count integer;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'treasury_movements' and c.relrowsecurity
  ) then
    raise exception 'TREASURY REGRESSION (0042): RLS is off on treasury_movements.';
  end if;

  -- No policy of any kind. This table has no customer-facing reader.
  select count(*) into v_count
  from pg_policies where schemaname = 'public' and tablename = 'treasury_movements';
  if v_count > 0 then
    raise exception 'TREASURY REGRESSION (0042): treasury_movements has % policy(ies); it should have none', v_count;
  end if;

  select count(*) into v_count
  from information_schema.table_privileges
  where table_schema = 'public' and table_name = 'treasury_movements'
    and grantee in ('anon', 'authenticated', 'public');
  if v_count > 0 then
    raise exception 'TREASURY REGRESSION (0042): treasury_movements has % grant(s) to a user role', v_count;
  end if;

  -- The index the no-double-sweep rule rests on.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'treasury_movements_reference_idx'
  ) then
    raise exception 'TREASURY REGRESSION (0042): the unique index on treasury_movements(reference) is missing.';
  end if;

  foreach v_name in array array[
    'record_treasury_movement', 'settle_treasury_movement',
    'admin_wallet_liabilities', 'admin_set_sweep_account'
  ]
  loop
    select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;
    if v_count = 0 then
      raise exception 'TREASURY REGRESSION (0042): % has gone missing', v_name;
    end if;

    select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name
      and (
        has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
      );
    if v_count > 0 then
      raise exception 'TREASURY REGRESSION (0042): % is executable by a user session', v_name;
    end if;
  end loop;

  return true;
end;
$$;

revoke execute on function assert_treasury_invariants() from public, anon, authenticated;


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
  raise notice 'Invariants hold, with the treasury included.';
end;
$$;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_first treasury_movements;
  v_again treasury_movements;
  v_paused timestamptz;
  v_rows integer;
  v_balance numeric;
begin
  insert into auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
  values (v_admin, 'g4-treasury@example.invalid', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', '', now(), now());
  insert into profiles (id, email, kyc_status, country)
  values (v_admin, 'g4-treasury@example.invalid', 'approved', 'NG')
  on conflict (id) do nothing;

  -- ── 1. A sweep reference records once ──────────────────────────────────
  -- THE most important behaviour in this file. Two cron runs a second apart
  -- must produce one transfer.
  v_first := record_treasury_movement(
    'NGN', 250000, 'Deposit balance', 'Payout funding account',
    'sweep_test_NGN_2026_01_01', 'automatic', current_date, null, null
  );
  if v_first.id is null then
    raise exception 'ASSERTION FAILED: the first sweep was not recorded.';
  end if;

  v_again := record_treasury_movement(
    'NGN', 250000, 'Deposit balance', 'Payout funding account',
    'sweep_test_NGN_2026_01_01', 'automatic', current_date, null, null
  );
  if v_again.id is not null then
    raise exception 'ASSERTION FAILED: the same sweep reference recorded twice. This is a double transfer.';
  end if;

  select count(*) into v_rows
  from treasury_movements where reference = 'sweep_test_NGN_2026_01_01';
  if v_rows <> 1 then
    raise exception 'ASSERTION FAILED: % rows for one sweep reference', v_rows;
  end if;

  -- ── 2. A movement touches no customer balance ──────────────────────────
  select coalesce(sum(balance), 0) into v_balance from wallets;
  v_first := record_treasury_movement(
    'NGN', 1000, 'Company account', 'Deposit balance',
    'manual_test_' || gen_random_uuid()::text, 'manual', current_date, 'typed in by hand', v_admin
  );
  if (select coalesce(sum(balance), 0) from wallets) <> v_balance then
    raise exception 'ASSERTION FAILED: recording a treasury movement moved a customer balance.';
  end if;
  if v_first.created_by is distinct from v_admin then
    raise exception 'ASSERTION FAILED: a manual movement did not record who made it.';
  end if;

  -- ── 3. A negative movement is refused ──────────────────────────────────
  begin
    perform record_treasury_movement(
      'NGN', -5, 'a', 'b', 'negative_test', 'manual', current_date, null, null
    );
    raise exception 'ASSERTION FAILED: a negative movement was accepted.';
  exception
    when others then
      if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  end;

  -- ── 4. Changing the destination pauses the sweep for a day ─────────────
  v_paused := admin_set_sweep_account('033', '0000000000', 'Test Bank Account', v_admin);
  if v_paused <= now() + interval '23 hours' then
    raise exception 'ASSERTION FAILED: changing the sweep account did not pause it for 24 hours.';
  end if;
  if (select value from app_settings where key = 'sweep_paused_until') = '' then
    raise exception 'ASSERTION FAILED: the pause was not stored.';
  end if;
  if (select value from app_settings where key = 'sweep_funding_account_name') <> 'Test Bank Account' then
    raise exception 'ASSERTION FAILED: the resolved account name was not stored.';
  end if;

  raise notice 'Treasury behavioural checks pass.';

  -- Leave nothing behind.
  delete from treasury_movements where created_by = v_admin or reference = 'sweep_test_NGN_2026_01_01';
  -- updated_by too, not only the value: app_settings references profiles, so
  -- leaving the fixture admin in there makes the profile undeletable.
  update app_settings set value = '', updated_by = null where key in (
    'sweep_funding_bank_code', 'sweep_funding_account_number',
    'sweep_funding_account_name', 'sweep_paused_until'
  );
  delete from profiles where id = v_admin;
  delete from auth.users where id = v_admin;
end;
$$;

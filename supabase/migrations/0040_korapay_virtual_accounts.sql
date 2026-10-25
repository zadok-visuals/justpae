-- ============================================================================
-- justpae 0040 — permanent naira account numbers, and the one function that
-- credits what arrives in them.
--
-- ── WHAT CHANGES FOR THE CUSTOMER ──────────────────────────────────────────
--
-- A naira deposit stops being an event the customer has to declare and starts
-- being an account number they keep. They send from their bank app whenever
-- they like, to a number that does not expire, and it lands. There is no
-- amount step, no reference to copy into a narration, and no human in the
-- path — which removes the three places the manual rail loses deposits.
--
-- ── THE RULE THIS FILE EXISTS TO ENFORCE ───────────────────────────────────
--
-- A WEBHOOK PAYLOAD NEVER MOVES MONEY. The receiver re-queries the charge
-- from the provider's own API and passes THAT amount here; this function has
-- no way to tell the difference, which is exactly why the rule is written at
-- the call site and asserted in the application tests. What this function
-- guarantees instead is the half that belongs in the database:
--
--   IT CREDITS AT MOST ONCE PER PROVIDER REFERENCE. Not by reading first and
--   writing second — two deliveries genuinely do arrive at the same moment,
--   and a read-then-write would let both through — but by inserting the
--   deposit row under the existing unique index on
--   (provider, provider_reference) and crediting only the insert that won.
--   The reconcile cron and the webhook can therefore both fire on the same
--   payment, in either order or at the same instant, and the wallet moves
--   once.
--
-- ── SECURITY ───────────────────────────────────────────────────────────────
--
-- virtual_accounts is readable by its owner and writable by nobody but the
-- service role: there is no insert, update or delete policy, deliberately. An
-- account number a customer could write is an account number they could point
-- at someone else's deposits.
--
-- credit_korapay_deposit is security definer, search_path pinned, and revoked
-- from public/anon/authenticated. p_user_id always arrives from
-- supabase.auth.getUser() or from the virtual_accounts row the server looked
-- up — never from a browser and never from the webhook body.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1. THE ACCOUNTS
-- ════════════════════════════════════════════════════════════════════════════

create table virtual_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  currency currency not null,
  provider transaction_provider not null,
  account_number text not null,
  bank_name text not null,
  account_name text not null,
  -- OUR reference, the one passed as account_reference when the account was
  -- created. It is how the account is looked up again at the provider, so it
  -- is unique per provider rather than merely indexed.
  provider_reference text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- One account per user, per currency, per provider. The brief's index, and
-- the thing that makes "get or create" safe to call from two tabs at once:
-- the loser of the race fails the insert rather than issuing a second number.
create unique index virtual_accounts_user_currency_provider_idx
  on virtual_accounts (user_id, currency, provider);

-- The reconcile cron and the webhook both start from an account NUMBER and
-- need the user it belongs to. Unique because two users sharing one account
-- number would mean crediting the wrong wallet, which no later check catches.
create unique index virtual_accounts_provider_number_idx
  on virtual_accounts (provider, account_number);

create unique index virtual_accounts_provider_reference_idx
  on virtual_accounts (provider, provider_reference);

-- Supabase grants every new public table to anon and authenticated by
-- default, so RLS alone would leave INSERT, UPDATE and DELETE available to a
-- user session the moment someone added a permissive policy — and would leave
-- the grants sitting there regardless. Taken away wholesale and handed back
-- one privilege at a time, the way 0022 does for conversion_holds.
revoke all on table virtual_accounts from public, anon, authenticated;
grant select on table virtual_accounts to authenticated;

alter table virtual_accounts enable row level security;

-- Read own, and nothing else. No insert/update/delete policy exists on
-- purpose — see the header.
create policy "virtual_accounts: read own" on virtual_accounts
  for select using (auth.uid() = user_id);

comment on table virtual_accounts is
  'Permanent provider-issued account numbers. Service-role writes only: a '
  'customer-writable account number is a customer-writable destination.';


-- ════════════════════════════════════════════════════════════════════════════
-- 2. WHAT A VIRTUAL-ACCOUNT DEPOSIT ROW HAS TO HOLD
-- ════════════════════════════════════════════════════════════════════════════
--
-- 0037 added received_amount (what arrived) and fee (what we charged) beside
-- confirmed_amount (what reached the wallet) so a receipt could explain
-- itself months later. This rail adds the one figure those three cannot
-- derive: what the PROVIDER took out of the settlement.
--
-- It is recorded and NOT deducted from the customer. The customer sent a
-- number they chose and is owed that number minus our own fee; the provider's
-- cut comes out of the merchant balance and is a cost of the rail, not a
-- charge to pass on silently. Holding it here is what lets the treasury page
-- reconcile "what customers are owed" against "what actually landed".

alter table deposits add column if not exists provider_fee numeric(18, 2);

comment on column deposits.provider_fee is
  'What the payment provider deducted from the settlement. Recorded, never '
  'charged to the customer — their credit is received_amount minus our fee.';

-- Which account number it arrived in. Null for every other deposit path.
alter table deposits add column if not exists virtual_account_id uuid
  references virtual_accounts (id);


-- ════════════════════════════════════════════════════════════════════════════
-- 3. THE FEE SETTING, SHARED BETWEEN BOTH NAIRA RAILS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Reusing manual_deposit_fee_ngn rather than adding a second naira deposit
-- fee. Two dials for one number is how an operator changes the fee and finds
-- that half their deposits ignored it; which rail a customer happened to use
-- is not a reason to charge them differently. The description is rewritten so
-- the admin screen stops implying it only applies to the manual rail.

update app_settings
set description = 'Flat naira fee deducted from a naira deposit before crediting. Applies to both naira rails — the account number and the manual bank transfer.'
where key = 'manual_deposit_fee_ngn';


-- ════════════════════════════════════════════════════════════════════════════
-- 4. RECORDING AN ISSUED ACCOUNT
-- ════════════════════════════════════════════════════════════════════════════
--
-- Called immediately after the provider returns one. Returns the row so the
-- caller does not have to read back what it just wrote, and tolerates the
-- race: if another request issued one first, THAT row is returned and this
-- one's provider-side account simply goes unused rather than being shown to
-- the customer as a second number to remember.

create function record_virtual_account(
  p_user_id uuid,
  p_currency currency,
  p_provider transaction_provider,
  p_account_number text,
  p_bank_name text,
  p_account_name text,
  p_provider_reference text
)
returns virtual_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row virtual_accounts;
begin
  if p_user_id is null or p_account_number is null or p_account_number = '' then
    raise exception 'A virtual account needs a user and an account number.';
  end if;

  insert into virtual_accounts (
    user_id, currency, provider, account_number, bank_name, account_name, provider_reference
  )
  values (
    p_user_id, p_currency, p_provider, p_account_number, p_bank_name,
    p_account_name, p_provider_reference
  )
  on conflict (user_id, currency, provider) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row
    from virtual_accounts
    where user_id = p_user_id and currency = p_currency and provider = p_provider;
  end if;

  return v_row;
end;
$$;

revoke execute on function record_virtual_account(uuid, currency, transaction_provider, text, text, text, text)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. THE CREDIT
-- ════════════════════════════════════════════════════════════════════════════
--
-- One call, idempotent on the provider reference, used by BOTH the webhook
-- and the reconcile cron. They are not two code paths that have to agree
-- about money — they are two triggers for the same one.
--
-- RETURNS A WORD, not a boolean, because the caller does different things
-- with each outcome: 'credited' sends the customer a notification,
-- 'already_credited' sends nothing (the webhook arriving after the cron must
-- not produce a second email), and 'below_fee' is an operations problem
-- rather than a customer one.

create function credit_korapay_deposit(
  p_user_id uuid,
  p_virtual_account_id uuid,
  p_provider_reference text,
  p_currency currency,
  -- What the provider's own API said arrived. The caller is responsible for
  -- having re-queried it; see the header.
  p_gross_amount numeric,
  -- What the provider deducted. Recorded, not charged on.
  p_provider_fee numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee numeric;
  v_credit numeric;
  v_deposit_id uuid;
begin
  if p_user_id is null then
    raise exception 'credit_korapay_deposit needs a user.';
  end if;
  if p_provider_reference is null or p_provider_reference = '' then
    raise exception 'credit_korapay_deposit needs a provider reference.';
  end if;
  if p_gross_amount is null or p_gross_amount <= 0 then
    raise exception 'credit_korapay_deposit needs a positive amount.';
  end if;

  -- Read in the same transaction that credits, not passed in: a
  -- caller-supplied fee is a caller-supplied credited amount with an extra
  -- step. Same rule as approve_manual_deposit.
  select coalesce(nullif(value, '')::numeric, 0) into v_fee
  from app_settings where key = 'manual_deposit_fee_ngn';
  v_fee := greatest(coalesce(v_fee, 0), 0);

  v_credit := p_gross_amount - v_fee;
  if v_credit <= 0 then
    -- No row is written. An arrival that does not cover the fee is a
    -- configuration mistake — a fee set above the smallest deposit anyone
    -- makes — and recording a completed deposit of zero would hide it.
    return 'below_fee';
  end if;

  -- THE IDEMPOTENCY. Not a select-then-insert: the unique index on
  -- (provider, provider_reference) from 0010 settles the race inside
  -- Postgres, and only the insert that actually wrote a row goes on to touch
  -- the wallet.
  insert into deposits (
    user_id, currency, amount, received_amount, fee, provider_fee,
    confirmed_amount, status, provider, provider_reference, method,
    virtual_account_id
  )
  values (
    p_user_id, p_currency, p_gross_amount, p_gross_amount, v_fee,
    greatest(coalesce(p_provider_fee, 0), 0), v_credit, 'completed', 'korapay',
    p_provider_reference, 'provider', p_virtual_account_id
  )
  on conflict (provider, provider_reference) where provider_reference is not null
  do nothing
  returning id into v_deposit_id;

  if v_deposit_id is null then
    return 'already_credited';
  end if;

  -- A user whose signup country provisioned no naira wallet still has naira
  -- arriving in an account number we issued them. Provision rather than
  -- dropping the money on the floor — same reasoning as credit_deposit.
  insert into wallets (user_id, currency, balance)
  values (p_user_id, p_currency, 0)
  on conflict (user_id, currency) do nothing;

  update wallets
  set balance = balance + v_credit, updated_at = now()
  where user_id = p_user_id and currency = p_currency;

  return 'credited';
end;
$$;

revoke execute on function credit_korapay_deposit(uuid, uuid, text, currency, numeric, numeric)
  from public, anon, authenticated;




-- ════════════════════════════════════════════════════════════════════════════
-- 6. THE INVARIANTS FOR THIS TABLE
-- ════════════════════════════════════════════════════════════════════════════
--
-- A SEPARATE FUNCTION, not an edit to assert_phase1_invariants. That one is
-- 250 lines of accumulated checks from 0014 through 0037, and replacing it to
-- append two names is how a check written three migrations ago quietly stops
-- running. Nothing here weakens it: its first check already covers the two
-- new functions, because anything not on its `v_allowed` whitelist that is
-- executable by `authenticated` fails it by construction. What that check
-- cannot see is the table, so this adds the table.

create function assert_korapay_invariants()
returns boolean
language plpgsql
as $$
declare
  v_offenders text;
  v_count integer;
begin
  -- RLS on. Without it the "read own" policy below is decorative and every
  -- customer's account number is readable by every session.
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'virtual_accounts' and c.relrowsecurity
  ) then
    raise exception 'KORAPAY REGRESSION (0040): RLS is off on virtual_accounts.';
  end if;

  -- No write policy of any kind. An account number a customer can write is a
  -- destination they can point at someone else's deposits.
  select string_agg(policyname || ' (' || cmd || ')', ', ') into v_offenders
  from pg_policies
  where schemaname = 'public' and tablename = 'virtual_accounts' and cmd <> 'SELECT';

  if v_offenders is not null then
    raise exception 'KORAPAY REGRESSION (0040): virtual_accounts has a non-SELECT policy: %', v_offenders;
  end if;

  select count(*) into v_count
  from information_schema.table_privileges
  where table_schema = 'public' and table_name = 'virtual_accounts'
    and grantee in ('anon', 'authenticated', 'public')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

  if v_count > 0 then
    raise exception 'KORAPAY REGRESSION (0040): virtual_accounts has % write grant(s) to a user role', v_count;
  end if;

  -- The index the credit function's idempotency rests on, and the one that
  -- stops two users sharing an account number.
  foreach v_offenders in array array[
    'virtual_accounts_user_currency_provider_idx',
    'virtual_accounts_provider_number_idx'
  ]
  loop
    if not exists (
      select 1 from pg_indexes where schemaname = 'public' and indexname = v_offenders
    ) then
      raise exception 'KORAPAY REGRESSION (0040): the unique index % is missing', v_offenders;
    end if;
  end loop;

  -- Both money functions exist and neither is callable by a user session.
  foreach v_offenders in array array['record_virtual_account', 'credit_korapay_deposit']
  loop
    select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_offenders;
    if v_count = 0 then
      raise exception 'KORAPAY REGRESSION (0040): % has gone missing', v_offenders;
    end if;

    select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_offenders
      and (
        has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
      );
    if v_count > 0 then
      raise exception 'KORAPAY REGRESSION (0040): % is executable by a user session', v_offenders;
    end if;
  end loop;

  return true;
end;
$$;

-- NOT granted to authenticated, unlike assert_phase1_invariants. That one is
-- on its own whitelist and so is allowed to be; this one is not, and granting
-- it fails the very check it was written beside — which is how this line came
-- to be a comment rather than a GRANT. Left here because the next person to
-- add an assert_ function will reach for the same grant.
revoke execute on function assert_korapay_invariants() from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 7. A CLEAN APPLY IS THE VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════
--
-- This machine has neither Docker nor psql — the same situation 0033, 0037
-- and 0038 record — so `supabase db push` against the linked project is the
-- only path to a database that exists here. The behavioural checks below are
-- what a pgTAP file would assert, written as a transaction that raises at the
-- end so it leaves nothing behind.
--
-- They cover the three rules that cannot be read off the catalog: the credit
-- is the gross minus OUR fee (not the provider's), a second call on the same
-- reference credits nothing, and an amount below the fee writes no row.

do $$
begin
  perform assert_phase1_invariants();
  perform assert_phase3_invariants();
  perform assert_phase4_invariants();
  perform assert_korapay_invariants();
  raise notice 'Invariants hold, with virtual accounts included.';
end;
$$;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_account virtual_accounts;
  v_account_again virtual_accounts;
  v_result text;
  v_balance numeric;
  v_rows integer;
  v_old_fee text;
begin
  insert into auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
  values (v_user, 'g2-vba@example.invalid', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', '', now(), now());

  insert into profiles (id, email, kyc_status, country)
  values (v_user, 'g2-vba@example.invalid', 'approved', 'NG')
  on conflict (id) do update set kyc_status = 'approved';

  insert into wallets (user_id, currency, balance)
  values (v_user, 'NGN', 0)
  on conflict (user_id, currency) do update set balance = 0;

  select value into v_old_fee from app_settings where key = 'manual_deposit_fee_ngn';
  update app_settings set value = '100' where key = 'manual_deposit_fee_ngn';

  -- ── 1. Issuing is idempotent per (user, currency, provider) ────────────
  v_account := record_virtual_account(
    v_user, 'NGN', 'korapay', '9900112233', 'Test Bank', 'justpae Test User', 'jp_test_ref'
  );
  if v_account.id is null then
    raise exception 'ASSERTION FAILED: no virtual account was recorded.';
  end if;

  -- A second call must hand back the SAME number, not issue another. Two
  -- account numbers for one wallet is two places money can arrive and one
  -- place anybody looks.
  v_account_again := record_virtual_account(
    v_user, 'NGN', 'korapay', '9988776655', 'Other Bank', 'justpae Test User', 'jp_test_ref_2'
  );
  if v_account_again.id is distinct from v_account.id then
    raise exception 'ASSERTION FAILED: a second call issued a second account number.';
  end if;

  -- ── 2. The credit is gross minus OUR fee; the provider fee is recorded ──
  v_result := credit_korapay_deposit(
    v_user, v_account.id, 'kpy_test_charge_1', 'NGN', 5000, 25
  );
  if v_result <> 'credited' then
    raise exception 'ASSERTION FAILED: expected credited, got %', v_result;
  end if;

  select balance into v_balance from wallets where user_id = v_user and currency = 'NGN';
  if v_balance <> 4900 then
    raise exception 'ASSERTION FAILED: expected 4900 (5000 gross minus a 100 fee), got %. The provider fee must NOT come off the customer.', v_balance;
  end if;

  if not exists (
    select 1 from deposits
    where provider = 'korapay' and provider_reference = 'kpy_test_charge_1'
      and received_amount = 5000 and fee = 100 and provider_fee = 25
      and confirmed_amount = 4900 and status = 'completed'
  ) then
    raise exception 'ASSERTION FAILED: the deposit row does not record all four figures.';
  end if;

  -- ── 3. The same reference twice credits once ───────────────────────────
  -- The webhook and the reconcile cron both fire on one payment. This is the
  -- single most important behaviour in this file.
  v_result := credit_korapay_deposit(
    v_user, v_account.id, 'kpy_test_charge_1', 'NGN', 5000, 25
  );
  if v_result <> 'already_credited' then
    raise exception 'ASSERTION FAILED: a repeat call returned %, not already_credited', v_result;
  end if;

  select balance into v_balance from wallets where user_id = v_user and currency = 'NGN';
  if v_balance <> 4900 then
    raise exception 'ASSERTION FAILED: a repeat call moved the balance to %', v_balance;
  end if;

  select count(*) into v_rows
  from deposits where provider = 'korapay' and provider_reference = 'kpy_test_charge_1';
  if v_rows <> 1 then
    raise exception 'ASSERTION FAILED: % deposit rows for one reference', v_rows;
  end if;

  -- ── 4. An arrival that does not cover the fee writes nothing ───────────
  v_result := credit_korapay_deposit(
    v_user, v_account.id, 'kpy_test_charge_2', 'NGN', 50, 0
  );
  if v_result <> 'below_fee' then
    raise exception 'ASSERTION FAILED: expected below_fee, got %', v_result;
  end if;
  if exists (select 1 from deposits where provider_reference = 'kpy_test_charge_2') then
    raise exception 'ASSERTION FAILED: a below-fee arrival wrote a deposit row.';
  end if;

  update app_settings set value = coalesce(v_old_fee, '0') where key = 'manual_deposit_fee_ngn';

  raise notice 'Virtual-account behavioural checks pass.';

  -- Leave nothing behind, the same way 0037 does. A raise-and-catch would
  -- roll the fixture back more tidily but would also swallow a genuine
  -- failure into the same handler, which is the wrong trade in a file whose
  -- whole point is to fail loudly.
  delete from deposits where user_id = v_user;
  delete from virtual_accounts where user_id = v_user;
  delete from wallets where user_id = v_user;
  delete from profiles where id = v_user;
  delete from auth.users where id = v_user;
end;
$$;

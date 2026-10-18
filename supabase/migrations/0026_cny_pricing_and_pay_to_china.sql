-- ============================================================================
-- justpae 0026 — CNY pricing, CNY conversions, and Pay to China.
--
-- This ports the reference implementation's CNY and RMB behaviour. It does NOT
-- port its security model, and the difference is the single most important
-- thing in this file.
--
-- WHAT THE REFERENCE DOES THAT THIS DELIBERATELY DOES NOT
--
-- Over there, `record_cny_conversion` and `create_rmb_manual_transaction(_v2)`
-- are both `grant execute … to authenticated`, and both take the amounts as
-- arguments:
--
--   record_cny_conversion(direction, from_currency, FROM_AMOUNT,
--                         to_currency, TO_AMOUNT, busha_rate, tier_rate,
--                         margin_rate)
--
-- A signed-in user can call that directly over PostgREST with to_amount set to
-- anything they like. It debits one wallet by a figure they chose and credits
-- another by a figure they chose. The same is true of the RMB function, whose
-- p_target_cny is whatever the caller says it is. That is the exact class of
-- hole justpae's 0010 closed for conversions and 0022 closed for ordering, and
-- it is not being reintroduced for a new currency.
--
-- SO, HERE:
--
--   * Every function below is revoked from public, anon and authenticated, and
--     is callable only through the service role, with p_user_id taken from
--     supabase.auth.getUser() in a server action.
--   * No function takes an amount or a rate from its caller. Both read every
--     figure off a server-written quote row that the caller can only name by
--     id — the same contract conversion_quotes has held since 0010.
--   * PIN, suspension, KYC and balance are checked, and the debit taken,
--     inside one transaction before anything else happens.
--   * Every new table has RLS. Both new buckets are private with owner-folder
--     policies, and the upload path is verified against the uploader's own id
--     in application code before it is ever written to a row.
--
-- WHAT A CNY BALANCE IS
--
-- An internal obligation, not a holding. No provider holds yuan for this
-- business. A CNY balance is created by converting into it at a price this
-- business sets, and is discharged by spending it through Pay to China or
-- converting back out. It therefore cannot be withdrawn, and that is enforced
-- here rather than only in the UI: see the cny_not_withdrawable trigger.
--
-- PRICING, AND WHY IT IS A LADDER
--
-- The price of CNY is not one number. It is the live fiat->USDT rate from the
-- provider (which only server code can fetch — Postgres cannot make an HTTP
-- call, which is why the blend happens in the server action and only the
-- RESULT is written here), blended with an internal USDT->CNY rate that
-- depends on size, plus a markup that differs for a fiat payer and a USDT
-- payer.
--
-- The size ladder is a real commercial fact: a larger order gets a better
-- yuan rate from the supplier. It is used to PRICE and is never shown to a
-- customer — the reference implementation showed the ladder on the customer
-- form and then removed it (b3a913d), and justpae starts from that end state.
-- Accordingly cny_tier_rates has RLS on and no read policy at all: a customer
-- session cannot read the ladder even if a future component asks for it.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1. THE CNY WALLET
-- ════════════════════════════════════════════════════════════════════════════

-- Every user gets one, exactly as the reference does today, because Pay to
-- China is offered to everyone regardless of which local currency they hold.
-- The alternative — provisioning on first use — means a conversion into CNY
-- fails for every user the first time they try it, since begin_conversion_hold
-- requires the destination wallet to exist before it will take the debit.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text := new.raw_user_meta_data ->> 'country';
  v_local_currency currency := case v_country
    when 'NG' then 'NGN'
    when 'GH' then 'GHS'
    when 'KE' then 'KES'
    else null
  end;
begin
  insert into public.profiles (id, email, full_name, country)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', v_country);

  insert into public.wallets (user_id, currency)
  values (new.id, 'USD'), (new.id, 'USDT'), (new.id, 'CNY');

  if v_local_currency is not null then
    insert into public.wallets (user_id, currency) values (new.id, v_local_currency);
  end if;

  return new;
end;
$$;

revoke execute on function handle_new_user() from public, anon, authenticated;

-- Back-fill. Idempotent, so re-applying this file is harmless.
insert into public.wallets (user_id, currency, balance)
select id, 'CNY', 0
from public.profiles
where not exists (
  select 1 from public.wallets w where w.user_id = profiles.id and w.currency = 'CNY'
);

-- ── CNY CANNOT BE WITHDRAWN, in the schema ─────────────────────────────────
--
-- The withdraw form hides it and create_withdrawal_request would refuse it,
-- but neither of those is a property of the data. A synthetic balance leaving
-- through a payout rail would be the business paying out real money against an
-- obligation it created for itself, which is the one failure here worth making
-- structurally impossible rather than merely unlikely.
create function transactions_reject_cny_withdrawal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.type = 'withdrawal' and new.currency = 'CNY' then
    raise exception 'CNY cannot be withdrawn. Spend it with Pay to China, or convert it first.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function transactions_reject_cny_withdrawal() from public, anon, authenticated;

create trigger transactions_reject_cny_withdrawal
  before insert or update on transactions
  for each row execute procedure transactions_reject_cny_withdrawal();

-- Same for a payout destination: a saved CNY recipient could never be used,
-- and offering one is how a user finds out only at submit time.
create function withdrawal_recipients_reject_cny()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.currency = 'CNY' then
    raise exception 'CNY has no payout destination. Spend it with Pay to China, or convert it first.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function withdrawal_recipients_reject_cny() from public, anon, authenticated;

create trigger withdrawal_recipients_reject_cny
  before insert or update on withdrawal_recipients
  for each row execute procedure withdrawal_recipients_reject_cny();


-- ════════════════════════════════════════════════════════════════════════════
-- 2. PRICING TABLES — admin-written, customer-invisible
-- ════════════════════════════════════════════════════════════════════════════

-- ── The size ladder ────────────────────────────────────────────────────────
-- CNY per 1 USDT, by order size in CNY. Bands are closed intervals and the
-- top band is open-ended in practice because the forward resolver falls back
-- to the last tier — see src/lib/cny/tiers.ts, where both directions of the
-- resolution are implemented and unit-tested.
create table cny_tier_rates (
  tier_min_cny numeric(18, 2) primary key,
  tier_max_cny numeric(18, 2) not null,
  usdt_to_cny_rate numeric(18, 6) not null,
  updated_at timestamptz not null default now(),
  constraint cny_tier_rates_band_ordered check (tier_max_cny > tier_min_cny),
  constraint cny_tier_rates_rate_positive check (usdt_to_cny_rate > 0)
);

insert into cny_tier_rates (tier_min_cny, tier_max_cny, usdt_to_cny_rate)
values (0, 999, 6.5), (1000, 100000, 6.6);

-- RLS on, and NO POLICY AT ALL — not even a read policy.
--
-- The reference implementation grants `select using (true)` here. That is what
-- let its customer-facing form render the ladder, which it later removed as a
-- product decision (b3a913d). A product decision implemented only in a
-- component comes back the next time someone builds a "rates" card. Removing
-- the read path makes it a property instead: a customer session cannot see the
-- ladder because there is nothing to see it with.
alter table cny_tier_rates enable row level security;
revoke all on table cny_tier_rates from public, anon, authenticated;

-- ── The markup ─────────────────────────────────────────────────────────────
-- One row, two values. Fiat and USDT payers carry genuinely different agreed
-- spreads, and collapsing them into one number was a regression the reference
-- implementation made and then undid (0023 then 0029). Starting from the end
-- state: two columns, one row, both admin-editable.
create table cny_markup_rate (
  id boolean primary key default true,
  fiat_markup_rate numeric(10, 6) not null,
  usdt_markup_rate numeric(10, 6) not null,
  updated_at timestamptz not null default now(),
  constraint cny_markup_rate_singleton check (id),
  constraint cny_markup_fiat_in_range check (fiat_markup_rate >= 0 and fiat_markup_rate < 1),
  constraint cny_markup_usdt_in_range check (usdt_markup_rate >= 0 and usdt_markup_rate < 1)
);

insert into cny_markup_rate (fiat_markup_rate, usdt_markup_rate) values (0.02, 0.01);

alter table cny_markup_rate enable row level security;
revoke all on table cny_markup_rate from public, anon, authenticated;

-- ── Supplier rates ─────────────────────────────────────────────────────────
-- What this business actually PAYS, as distinct from what it charges. Only
-- /admin/pnl reads it, and the margin on an order is the gap between the two.
--
-- Append-only by convention, not by trigger: a new rate is a new row with its
-- own effective_from, and old rows stay so that "what did an order placed in
-- March cost us" has an answer in March's terms rather than today's.
--
-- Direction convention, as everywhere else in this codebase: QUOTE per 1 BASE.
create table supplier_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency currency not null,
  quote_currency currency not null,
  buy_rate numeric(24, 10) not null,
  effective_from timestamptz not null default now(),
  set_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint supplier_rates_rate_positive check (buy_rate > 0),
  constraint supplier_rates_distinct_currencies check (base_currency <> quote_currency)
);

create index supplier_rates_pair_effective_idx
  on supplier_rates (base_currency, quote_currency, effective_from desc);

alter table supplier_rates enable row level security;
revoke all on table supplier_rates from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. CNY CONVERSIONS — the Group 1 hold-and-finalise pattern, reused whole
-- ════════════════════════════════════════════════════════════════════════════
--
-- A CNY conversion is a conversion. It uses begin_conversion_hold (0022) for
-- the suspension check, the PIN check, the destination-wallet check, the
-- balance check and the debit; it uses conversion_quotes (0010) for the
-- server-written figures; and it uses complete_conversion (0005) for the
-- credit. Nothing about those needed changing to accept a new currency.
--
-- Only the settle step is new, and only because of one difference: there is no
-- provider. create_conversion_from_held_quote writes provider = 'busha' and
-- leaves the row pending for a webhook that will never fire for a currency no
-- provider holds. A CNY conversion is final the moment it is recorded.

create function settle_cny_conversion(
  p_user_id uuid,
  p_hold_id uuid,
  p_quote_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold conversion_holds%rowtype;
  v_quote conversion_quotes%rowtype;
  v_transaction_id uuid;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Hold first, then quote. Same lock order as
  -- create_conversion_from_held_quote: two paths taking the same two locks in
  -- opposite orders is a deadlock waiting for load.
  select * into v_hold from conversion_holds where id = p_hold_id for update;

  if v_hold.id is null or v_hold.user_id <> p_user_id then
    raise exception 'That conversion is no longer valid. Please try again.';
  end if;

  if v_hold.status <> 'held' then
    raise exception 'That conversion has already been settled.';
  end if;

  select * into v_quote from conversion_quotes where id = p_quote_id for update;

  if v_quote.id is null or v_quote.user_id <> p_user_id then
    raise exception 'That quote is no longer valid. Please try again.';
  end if;

  if v_quote.consumed_at is not null then
    raise exception 'That quote has already been used.';
  end if;

  -- One side must be CNY. Without this, this function is a second, weaker
  -- settlement path for an ordinary provider-backed conversion — one that
  -- marks it completed and credits the target without any provider ever
  -- having moved anything.
  if v_quote.source_currency <> 'CNY' and v_quote.target_currency <> 'CNY' then
    raise exception 'settle_cny_conversion is only for conversions involving CNY.';
  end if;

  -- The quote must describe the money that was actually held. Both rows are
  -- server-written, so this should never fire; "should never fire" is a hope,
  -- not a property.
  if v_quote.source_currency <> v_hold.source_currency
     or v_quote.target_currency <> v_hold.target_currency
     or v_quote.source_amount <> v_hold.source_amount then
    raise exception 'That conversion no longer matches the amount held.';
  end if;

  -- UNLIKE the provider path, the expiry IS enforced here.
  --
  -- create_conversion_from_held_quote deliberately ignores expires_at, because
  -- by the time it runs the provider has already moved real money and
  -- refusing to record that would strand it. Nothing has moved here except
  -- this business's own ledger, so an expired quote is simply an expired
  -- price, and honouring it would mean settling at a rate the market has
  -- already left behind.
  if v_quote.expires_at < now() then
    raise exception 'That rate has expired. Please try again.';
  end if;

  insert into transactions (
    user_id, type, provider, status, amount, currency,
    target_currency, target_amount,
    provider_rate, markup_rate, customer_rate, raw_target_amount
  )
  values (
    p_user_id, 'convert', 'manual', 'pending', v_quote.source_amount, v_quote.source_currency,
    v_quote.target_currency, v_quote.target_amount,
    v_quote.provider_rate, v_quote.markup_rate, v_quote.customer_rate, v_quote.raw_target_amount
  )
  returning id into v_transaction_id;

  update conversion_quotes set consumed_at = now() where id = p_quote_id;

  update conversion_holds
  set status = 'settled', transaction_id = v_transaction_id, resolved_at = now()
  where id = p_hold_id;

  -- Credits the target wallet and marks the row completed, in this same
  -- transaction. Reused rather than reimplemented so a CNY conversion and a
  -- provider conversion credit a wallet by exactly one code path.
  perform complete_conversion(v_transaction_id);

  return v_transaction_id;
end;
$$;

revoke execute on function settle_cny_conversion(uuid, uuid, uuid)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. PAY TO CHINA — recipients
-- ════════════════════════════════════════════════════════════════════════════

create type payout_method as enum ('alipay', 'wechat', 'bank');

-- ── The recipient of one request ───────────────────────────────────────────
-- A SNAPSHOT, not a reference. The row is written at submit time and never
-- updated, so a request settled three days later shows the admin the details
-- the customer actually gave, even if the customer has since edited the saved
-- recipient it was copied from.
create table pay_to_china_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  transaction_id uuid references transactions (id) on delete set null,
  payout_method payout_method not null,
  recipient_first_name text,
  recipient_last_name text,
  recipient_alipay_id text,
  recipient_wechat_id text,
  recipient_bank_account_number text,
  recipient_bank_name text,
  recipient_account_holder_name text,
  -- Path inside the private 'pay-to-china-qr' bucket. Verified against the
  -- uploader's own id before it is written — see verifyOwnedUpload.
  qr_code_ref text,
  created_at timestamptz not null default now(),

  -- A QR CODE ALONE IS ENOUGH, and this constraint is why.
  --
  -- The reference implementation required a typed Alipay/WeChat id on top of
  -- the names, while its own action deliberately allowed a QR-only recipient —
  -- so every QR-only submission failed on a check constraint (their 0043 is
  -- the fix). Writing it correctly the first time: an id OR a QR, both names
  -- either way.
  constraint pay_to_china_alipay_check check (
    payout_method <> 'alipay' or (
      recipient_first_name is not null and recipient_last_name is not null
      and (recipient_alipay_id is not null or qr_code_ref is not null)
    )
  ),
  constraint pay_to_china_wechat_check check (
    payout_method <> 'wechat' or (
      recipient_first_name is not null and recipient_last_name is not null
      and (recipient_wechat_id is not null or qr_code_ref is not null)
    )
  ),
  constraint pay_to_china_bank_check check (
    payout_method <> 'bank' or (
      recipient_bank_account_number is not null
      and recipient_bank_name is not null
      and recipient_account_holder_name is not null
    )
  )
);

create index pay_to_china_recipients_user_idx on pay_to_china_recipients (user_id, created_at desc);
create index pay_to_china_recipients_transaction_idx on pay_to_china_recipients (transaction_id);

alter table pay_to_china_recipients enable row level security;

create policy "pay_to_china_recipients: read own" on pay_to_china_recipients
  for select using (auth.uid() = user_id);

create policy "pay_to_china_recipients: insert own" on pay_to_china_recipients
  for insert with check (auth.uid() = user_id);

-- Deliberately no update or delete policy. The snapshot is evidence of what
-- an admin was asked to pay; a customer editing it after the fact, or deleting
-- it out from under a request in flight, is not something this table should
-- allow.

-- ── Saved recipients ───────────────────────────────────────────────────────
-- Reusable, editable, and never attached to a transaction. Keeping these
-- separate from the snapshot above is what makes the snapshot immutable.
create table saved_pay_to_china_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  label text not null,
  payout_method payout_method not null,
  recipient_first_name text,
  recipient_last_name text,
  recipient_alipay_id text,
  recipient_wechat_id text,
  recipient_bank_account_number text,
  recipient_bank_name text,
  recipient_account_holder_name text,
  qr_code_ref text,
  created_at timestamptz not null default now(),
  constraint saved_pay_to_china_label_not_blank check (trim(label) <> '')
);

create index saved_pay_to_china_recipients_user_idx
  on saved_pay_to_china_recipients (user_id, created_at desc);

alter table saved_pay_to_china_recipients enable row level security;

create policy "saved_pay_to_china_recipients: read own" on saved_pay_to_china_recipients
  for select using (auth.uid() = user_id);
create policy "saved_pay_to_china_recipients: insert own" on saved_pay_to_china_recipients
  for insert with check (auth.uid() = user_id);
create policy "saved_pay_to_china_recipients: delete own" on saved_pay_to_china_recipients
  for delete using (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 5. PAY TO CHINA — the quote, and the request
-- ════════════════════════════════════════════════════════════════════════════

-- ── The quote ──────────────────────────────────────────────────────────────
-- Same contract as conversion_quotes, for the same reason: the figures are
-- written here by server code, and the function that spends them is given
-- nothing but this row's id. There is no argument through which an amount can
-- arrive from a browser.
--
-- This is precisely what the reference implementation's
-- create_rmb_manual_transaction_v2 does not have — its p_target_cny is
-- whatever its (authenticated-callable) caller passes.
create table pay_to_china_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  source_currency currency not null,
  source_amount numeric(18, 2) not null,
  -- What the recipient in China is to receive.
  target_cny numeric(18, 2) not null,
  -- The rate trail, for /admin/pnl and for a receipt that can be audited.
  provider_rate numeric(24, 10),
  tier_rate numeric(24, 10),
  markup_rate numeric(10, 6),
  raw_target_cny numeric(18, 2),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pay_to_china_quotes_amounts_positive check (source_amount > 0 and target_cny > 0)
);

create index pay_to_china_quotes_user_created_idx on pay_to_china_quotes (user_id, created_at desc);
create index pay_to_china_quotes_expiry_idx on pay_to_china_quotes (expires_at) where consumed_at is null;

alter table pay_to_china_quotes enable row level security;
revoke all on table pay_to_china_quotes from public, anon, authenticated;

-- ── Where a completed request's payment proof lives ────────────────────────
alter table transactions add column payment_proof_ref text;

-- ── Lets a notification carry a link to that proof ─────────────────────────
alter table notifications add column attachment_ref text;

-- ── Creating the request ───────────────────────────────────────────────────
--
-- ONE ATOMIC FUNCTION, no hold. The hold-and-release pattern exists for the
-- window between taking a user's money and hearing back from a provider.
-- There is no provider here and no window: the debit and the ledger row are
-- written in the same transaction, which is strictly stronger than a hold.
--
-- Everything that can refuse happens before the debit: suspension, PIN, KYC,
-- recipient ownership, quote validity, balance.
create function create_pay_to_china_request(
  p_user_id uuid,
  p_quote_id uuid,
  p_recipient_id uuid,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suspended_at timestamptz;
  v_kyc_status kyc_status;
  v_quote pay_to_china_quotes%rowtype;
  v_balance numeric;
  v_transaction_id uuid;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select suspended_at, kyc_status into v_suspended_at, v_kyc_status
  from profiles where id = p_user_id;

  if v_suspended_at is not null then
    raise exception 'This account is suspended. Please contact support.'
      using errcode = 'check_violation';
  end if;

  -- KYC IS A GATE HERE, unlike on a conversion. Money is leaving the platform
  -- to a named person in another country; that is the same category of
  -- movement as a withdrawal, and create_withdrawal_request gates it the same
  -- way. The UI checks this too, and the UI is not the enforcement.
  if v_kyc_status is distinct from 'approved' then
    raise exception 'Verify your identity before sending money to China.'
      using errcode = 'check_violation';
  end if;

  -- Raises on a wrong or unset PIN. The five-try lockout is counted by the
  -- caller's resolvePinError, which needs its own transaction — see
  -- src/lib/pin.ts.
  perform verify_transaction_pin(p_user_id, p_pin);

  select * into v_quote from pay_to_china_quotes where id = p_quote_id for update;

  -- Same message for "no such quote" and "someone else's quote", so this is
  -- not an oracle for which uuids exist.
  if v_quote.id is null or v_quote.user_id <> p_user_id then
    raise exception 'That quote is no longer valid. Please try again.';
  end if;

  if v_quote.consumed_at is not null then
    raise exception 'That quote has already been used.';
  end if;

  if v_quote.expires_at < now() then
    raise exception 'That rate has expired. Please try again.';
  end if;

  -- The recipient must belong to this user. Without this check a request
  -- could be submitted against somebody else's recipient row, which is both a
  -- privacy leak and a way to pay a stranger's vendor with your own money.
  if not exists (
    select 1 from pay_to_china_recipients
    where id = p_recipient_id and user_id = p_user_id and transaction_id is null
  ) then
    raise exception 'Those recipient details are no longer valid. Please re-enter them.';
  end if;

  -- FOR UPDATE serialises concurrent requests out of the same wallet, so two
  -- simultaneous submissions cannot both pass the balance check.
  select balance into v_balance
  from wallets
  where user_id = p_user_id and currency = v_quote.source_currency
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for currency %', v_quote.source_currency;
  end if;

  if v_balance < v_quote.source_amount then
    raise exception 'Insufficient balance';
  end if;

  update wallets
  set balance = balance - v_quote.source_amount, updated_at = now()
  where user_id = p_user_id and currency = v_quote.source_currency;

  insert into transactions (
    user_id, type, provider, status, amount, currency,
    target_currency, target_amount,
    provider_rate, markup_rate, customer_rate, raw_target_amount
  )
  values (
    p_user_id, 'pay_to_china', 'manual', 'pending',
    v_quote.source_amount, v_quote.source_currency,
    'CNY', v_quote.target_cny,
    v_quote.provider_rate, v_quote.markup_rate,
    case when v_quote.source_amount > 0 then v_quote.target_cny / v_quote.source_amount end,
    v_quote.raw_target_cny
  )
  returning id into v_transaction_id;

  update pay_to_china_quotes set consumed_at = now() where id = p_quote_id;

  update pay_to_china_recipients
  set transaction_id = v_transaction_id
  where id = p_recipient_id;

  return v_transaction_id;
end;
$$;

revoke execute on function create_pay_to_china_request(uuid, uuid, uuid, text)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. PAY TO CHINA — the admin queue
-- ════════════════════════════════════════════════════════════════════════════
--
-- Each of the three writes to the admin activity ledger (0019) in the same
-- transaction as the state change, so "it was marked complete but nobody
-- knows who by" cannot happen. p_admin_id comes from requireAdminUser() in an
-- admin-gated server action, never from a form.

create function admin_start_pay_to_china(p_transaction_id uuid, p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status transaction_status;
begin
  select status into v_status
  from transactions
  where id = p_transaction_id and type = 'pay_to_china'
  for update;

  if v_status is null then
    raise exception 'Request not found.';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only a pending request can be marked as processing.';
  end if;

  update transactions set status = 'processing' where id = p_transaction_id;

  perform admin_log_activity(
    p_admin_id, 'pay_to_china.processing', 'transaction', p_transaction_id::text, null
  );
end;
$$;

revoke execute on function admin_start_pay_to_china(uuid, uuid) from public, anon, authenticated;

create function admin_complete_pay_to_china(
  p_transaction_id uuid,
  p_admin_id uuid,
  p_actual_cny numeric,
  p_proof_ref text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status transaction_status;
begin
  if p_actual_cny is null or p_actual_cny <= 0 then
    raise exception 'Enter the CNY amount that was actually delivered.';
  end if;

  select status into v_status
  from transactions
  where id = p_transaction_id and type = 'pay_to_china'
  for update;

  if v_status is null then
    raise exception 'Request not found.';
  end if;
  if v_status not in ('pending', 'processing') then
    raise exception 'That request has already been settled.';
  end if;

  update transactions
  set status = 'completed',
      actual_target_amount = p_actual_cny,
      payment_proof_ref = coalesce(p_proof_ref, payment_proof_ref)
  where id = p_transaction_id;

  perform admin_log_activity(
    p_admin_id, 'pay_to_china.complete', 'transaction', p_transaction_id::text,
    jsonb_build_object('actual_cny', p_actual_cny, 'note', left(coalesce(p_note, ''), 500))
  );
end;
$$;

revoke execute on function admin_complete_pay_to_china(uuid, uuid, numeric, text, text)
  from public, anon, authenticated;

-- THE REFUND IS PART OF THE REJECTION, not a second step a human might skip.
-- A rejected request that leaves the debit in place is a customer who paid for
-- nothing, and discovering it depends on someone noticing.
create function admin_reject_pay_to_china(
  p_transaction_id uuid,
  p_admin_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_amount numeric;
  v_currency currency;
  v_status transaction_status;
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A rejection reason is required.';
  end if;

  select user_id, amount, currency, status
  into v_user_id, v_amount, v_currency, v_status
  from transactions
  where id = p_transaction_id and type = 'pay_to_china'
  for update;

  if v_user_id is null then
    raise exception 'Request not found.';
  end if;
  if v_status not in ('pending', 'processing') then
    raise exception 'That request has already been settled.';
  end if;

  -- Deliberately works for a suspended account: 0019's rule is that suspension
  -- stops new activity and never strands money already in flight, and a refund
  -- of the user's own money is the clearest case of that.
  update wallets
  set balance = balance + v_amount, updated_at = now()
  where user_id = v_user_id and currency = v_currency;

  update transactions
  set status = 'failed', decline_reason = left(p_reason, 1000)
  where id = p_transaction_id;

  perform admin_log_activity(
    p_admin_id, 'pay_to_china.reject', 'transaction', p_transaction_id::text,
    jsonb_build_object('reason', left(p_reason, 500), 'refunded', v_amount, 'currency', v_currency)
  );
end;
$$;

revoke execute on function admin_reject_pay_to_china(uuid, uuid, text)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 7. ADMIN RATE SETTERS
-- ════════════════════════════════════════════════════════════════════════════

create function admin_set_cny_tier_rate(
  p_tier_min numeric,
  p_tier_max numeric,
  p_rate numeric,
  p_admin_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rate is null or p_rate <= 0 then
    raise exception 'Rate must be greater than zero.';
  end if;
  if p_tier_max is null or p_tier_min is null or p_tier_max <= p_tier_min then
    raise exception 'The upper bound of a band must be above its lower bound.';
  end if;

  insert into cny_tier_rates (tier_min_cny, tier_max_cny, usdt_to_cny_rate)
  values (p_tier_min, p_tier_max, p_rate)
  on conflict (tier_min_cny) do update
    set tier_max_cny = excluded.tier_max_cny,
        usdt_to_cny_rate = excluded.usdt_to_cny_rate,
        updated_at = now();

  perform admin_log_activity(
    p_admin_id, 'cny.tier_rate.set', 'cny_tier_rate', p_tier_min::text,
    jsonb_build_object('tier_max', p_tier_max, 'rate', p_rate)
  );
end;
$$;

revoke execute on function admin_set_cny_tier_rate(numeric, numeric, numeric, uuid)
  from public, anon, authenticated;

create function admin_delete_cny_tier_rate(p_tier_min numeric, p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  select count(*) into v_remaining from cny_tier_rates;
  if v_remaining <= 1 then
    raise exception 'At least one rate band must remain, or CNY cannot be priced at all.';
  end if;

  delete from cny_tier_rates where tier_min_cny = p_tier_min;

  perform admin_log_activity(
    p_admin_id, 'cny.tier_rate.delete', 'cny_tier_rate', p_tier_min::text, null
  );
end;
$$;

revoke execute on function admin_delete_cny_tier_rate(numeric, uuid)
  from public, anon, authenticated;

create function admin_set_cny_markup_rate(
  p_fiat_markup_rate numeric,
  p_usdt_markup_rate numeric,
  p_admin_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_fiat_markup_rate is null or p_fiat_markup_rate < 0 or p_fiat_markup_rate >= 1 then
    raise exception 'Fiat markup must be between 0 and 1 (0.02 is 2%%).';
  end if;
  if p_usdt_markup_rate is null or p_usdt_markup_rate < 0 or p_usdt_markup_rate >= 1 then
    raise exception 'USDT markup must be between 0 and 1 (0.01 is 1%%).';
  end if;

  update cny_markup_rate
  set fiat_markup_rate = p_fiat_markup_rate,
      usdt_markup_rate = p_usdt_markup_rate,
      updated_at = now()
  where id = true;

  perform admin_log_activity(
    p_admin_id, 'cny.markup.set', 'cny_markup_rate', 'singleton',
    jsonb_build_object('fiat', p_fiat_markup_rate, 'usdt', p_usdt_markup_rate)
  );
end;
$$;

revoke execute on function admin_set_cny_markup_rate(numeric, numeric, uuid)
  from public, anon, authenticated;

create function admin_set_supplier_rate(
  p_base_currency currency,
  p_quote_currency currency,
  p_buy_rate numeric,
  p_effective_from timestamptz,
  p_admin_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_buy_rate is null or p_buy_rate <= 0 then
    raise exception 'Rate must be greater than zero.';
  end if;
  if p_base_currency = p_quote_currency then
    raise exception 'A supplier rate needs two different currencies.';
  end if;

  insert into supplier_rates (base_currency, quote_currency, buy_rate, effective_from, set_by)
  values (p_base_currency, p_quote_currency, p_buy_rate,
          coalesce(p_effective_from, now()), p_admin_id)
  returning id into v_id;

  perform admin_log_activity(
    p_admin_id, 'supplier_rate.set', 'supplier_rate', v_id::text,
    jsonb_build_object(
      'pair', p_base_currency::text || '/' || p_quote_currency::text,
      'rate', p_buy_rate
    )
  );

  return v_id;
end;
$$;

revoke execute on function admin_set_supplier_rate(currency, currency, numeric, timestamptz, uuid)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 8. PRIVATE BUCKETS
-- ════════════════════════════════════════════════════════════════════════════

-- ── The recipient's QR code ────────────────────────────────────────────────
-- Uploaded by the customer, straight from the browser into their own folder —
-- a screenshot easily exceeds the server-action body limit, which is why this
-- does not go through the server. The path that comes back is untrusted input
-- and is re-verified against the uploader's own id before any row records it
-- (verifyOwnedUpload), because the storage policy stops them WRITING outside
-- their folder but nothing stops them REFERENCING someone else's.
--
-- file_size_limit and allowed_mime_types are set on the bucket so Storage
-- itself enforces them, even for a client that skips the app's own checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pay-to-china-qr',
  'pay-to-china-qr',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "pay-to-china-qr: insert own folder" on storage.objects
  for insert with check (
    bucket_id = 'pay-to-china-qr' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "pay-to-china-qr: read own folder" on storage.objects
  for select using (
    bucket_id = 'pay-to-china-qr' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── The admin's payment proof ──────────────────────────────────────────────
-- The folder is the CUSTOMER's user id, so the proof lives beside everything
-- else about that customer and they can read it. There is deliberately NO
-- insert policy: the admin is never the folder owner, so there is no RLS path
-- for them to write here at all. Admin uploads go through a signed upload URL
-- minted with the service role, which bypasses RLS by design and is the only
-- way in.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pay-to-china-proof',
  'pay-to-china-proof',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "pay-to-china-proof: read own folder" on storage.objects
  for select using (
    bucket_id = 'pay-to-china-proof' and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 9. THE INVARIANTS, EXTENDED
-- ════════════════════════════════════════════════════════════════════════════
--
-- Check 1 already catches any new function left callable by a user session —
-- that is the catch-all, and it would catch a forgotten revoke above. Naming
-- each new money function in v_must_be_server_only additionally catches the
-- other way to lose protection: the function being DROPPED, which a grant
-- audit sails straight past.
--
-- Two new table assertions follow the same reasoning for the two tables whose
-- readability is itself the security property: pay_to_china_quotes (the
-- figures a request settles at) and cny_tier_rates (the ladder a customer must
-- not see).

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
    -- Phase 4
    'assert_phase4_invariants'
    -- 0026 adds NO user-callable function. Every CNY and Pay to China function
    -- is service-role only, which is the whole difference between this port
    -- and the implementation it is ported from.
  ];
  v_must_not_exist text[] := array[
    'create_conversion',
    'create_bill_payment',
    'set_transaction_provider_reference',
    'change_withdrawal_pin',
    'request_recipient_change',
    'confirm_recipient_change',
    -- 0026: the reference implementation's two authenticated-callable,
    -- caller-supplies-the-amount functions. Named here so that porting them
    -- in later — by anyone, for any reason — fails this assertion loudly
    -- instead of quietly reopening 0010's hole for a new currency.
    'record_cny_conversion',
    'create_rmb_manual_transaction',
    'create_rmb_manual_transaction_v2'
  ];
  v_must_be_server_only text[] := array[
    'verify_transaction_pin',
    'create_conversion_from_quote',
    'create_bill_payment_for_user',
    'complete_conversion',
    'fail_conversion',
    'credit_deposit',
    'fail_deposit',
    'begin_conversion_hold',
    'release_conversion_hold',
    'create_conversion_from_held_quote',
    'expire_stale_conversion_holds',
    -- 0024
    'partially_complete_conversion',
    -- 0026
    'settle_cny_conversion',
    'create_pay_to_china_request',
    'admin_start_pay_to_china',
    'admin_complete_pay_to_china',
    'admin_reject_pay_to_china',
    'admin_set_cny_tier_rate',
    'admin_delete_cny_tier_rate',
    'admin_set_cny_markup_rate',
    'admin_set_supplier_rate'
  ];
  v_offenders text;
  v_count integer;
  v_table text;
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
    raise exception 'PHASE 1 REGRESSION: these functions take caller-supplied money values and must not exist: %', v_offenders;
  end if;

  select string_agg(m.name, ', ') into v_offenders
  from unnest(v_must_be_server_only) as m(name)
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = m.name
  );

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION: these money functions have gone missing: %', v_offenders;
  end if;

  select string_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), ', ')
  into v_offenders
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any(v_must_be_server_only)
    and (
      has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
    );

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION: these money functions are executable by a user session: %', v_offenders;
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'conversion_holds' and c.relrowsecurity
  ) then
    raise exception 'PHASE 1 REGRESSION: conversion_holds does not have RLS enabled';
  end if;

  select count(*) into v_count
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'conversion_holds'
    and grantee in ('anon', 'authenticated', 'public');

  if v_count > 0 then
    raise exception 'PHASE 1 REGRESSION: conversion_holds has % grant(s) to a user role', v_count;
  end if;

  -- ── 0026: the two tables whose unreadability IS the property ────────────
  --
  -- pay_to_china_quotes holds the figures a request settles at. A readable one
  -- leaks the rate trail before settlement; a writable one is 0010's hole with
  -- a new table name.
  --
  -- cny_tier_rates is the size ladder. It prices and it must never display:
  -- this is the product decision from b3a913d, made structural.
  foreach v_table in array array['pay_to_china_quotes', 'cny_tier_rates', 'cny_markup_rate', 'supplier_rates']
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table and c.relrowsecurity
    ) then
      raise exception 'PHASE 1 REGRESSION (0026): % does not have RLS enabled', v_table;
    end if;

    select count(*) into v_count
    from information_schema.table_privileges
    where table_schema = 'public' and table_name = v_table
      and grantee in ('anon', 'authenticated', 'public');

    if v_count > 0 then
      raise exception 'PHASE 1 REGRESSION (0026): % has % grant(s) to a user role', v_table, v_count;
    end if;

    select count(*) into v_count
    from pg_policies where schemaname = 'public' and tablename = v_table;

    if v_count > 0 then
      raise exception 'PHASE 1 REGRESSION (0026): % has % RLS policy/policies and must have none', v_table, v_count;
    end if;
  end loop;

  -- ── 0026: CNY cannot leave through a payout rail ────────────────────────
  if not exists (
    select 1 from pg_trigger
    where tgname = 'transactions_reject_cny_withdrawal' and not tgisinternal
  ) then
    raise exception 'PHASE 1 REGRESSION (0026): the transactions_reject_cny_withdrawal trigger is missing — a synthetic CNY balance could be withdrawn as real money.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'withdrawal_recipients_reject_cny' and not tgisinternal
  ) then
    raise exception 'PHASE 1 REGRESSION (0026): the withdrawal_recipients_reject_cny trigger is missing.';
  end if;

  return true;
end;
$$;

grant execute on function assert_phase1_invariants() to authenticated;

-- A clean apply of this file IS the verification.
do $$
begin
  perform assert_phase1_invariants();
  raise notice 'Phase 1 invariants hold, with CNY and Pay to China included.';
end;
$$;

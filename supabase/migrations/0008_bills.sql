-- ============================================================================
-- justpae 0008 — bills and airtime.
--
-- New: nothing to port. Same discipline as every other money path — the debit
-- happens inside create_bill_payment with the wallet row locked and the PIN
-- verified in the same transaction, and a failure refunds atomically rather
-- than leaving the user short.
--
-- The provider is behind src/lib/providers/bills.ts with a feature flag that
-- ships OFF. Schema, server actions and UI are complete; only the provider
-- call is stubbed, because inventing a biller API would produce code that
-- cannot be reviewed against anything real.
-- ============================================================================

create table bill_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  category bill_category not null,
  -- ISO 3166-1 alpha-2. Bills are country-scoped: the same biller code means
  -- nothing across countries, and the identifier format differs too.
  country text not null,
  biller_code text not null,
  biller_name text not null,
  -- Phone number, meter number or smartcard number, depending on category.
  customer_identifier text not null,
  -- Returned by the biller's own name-validation step where it supports one;
  -- null where it does not. Shown on the review screen so the user can catch a
  -- mistyped meter number before paying.
  customer_name text,
  amount numeric(18, 2) not null,
  currency currency not null,
  fee numeric(18, 2) not null default 0,
  status bill_status not null default 'pending',
  provider text not null,
  provider_reference text,
  -- Prepaid electricity token, shown large with a copy button on the receipt.
  -- This is the single most important field on an electricity receipt: without
  -- it the customer cannot load the units they just paid for.
  token text,
  units text,
  decline_reason text,
  created_at timestamptz not null default now(),
  constraint bill_payments_amount_positive check (amount > 0)
);

create index bill_payments_user_created_idx on bill_payments (user_id, created_at desc);
create index bill_payments_status_idx on bill_payments (status);

alter table bill_payments enable row level security;

create policy "bill_payments: read own" on bill_payments for select using (auth.uid() = user_id);
-- No insert/update policy: created only via create_bill_payment, which debits.

-- ── Saved beneficiaries — one-tap repeat ───────────────────────────────────
create table bill_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  label text not null,
  category bill_category not null,
  country text not null,
  biller_code text not null,
  biller_name text not null,
  customer_identifier text not null,
  created_at timestamptz not null default now(),
  constraint bill_beneficiaries_unique unique (user_id, category, biller_code, customer_identifier)
);

alter table bill_beneficiaries enable row level security;

-- Beneficiaries hold no money and move none, so unlike every other table here
-- the owner writes them directly rather than through a function.
create policy "bill_beneficiaries: read own" on bill_beneficiaries for select using (auth.uid() = user_id);
create policy "bill_beneficiaries: insert own" on bill_beneficiaries for insert with check (auth.uid() = user_id);
create policy "bill_beneficiaries: update own" on bill_beneficiaries for update using (auth.uid() = user_id);
create policy "bill_beneficiaries: delete own" on bill_beneficiaries for delete using (auth.uid() = user_id);

-- ── create_bill_payment — debit, then record ───────────────────────────────
create function create_bill_payment(
  p_category bill_category,
  p_country text,
  p_biller_code text,
  p_biller_name text,
  p_customer_identifier text,
  p_customer_name text,
  p_amount numeric,
  p_currency currency,
  p_fee numeric,
  p_provider text,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_total numeric;
  v_bill_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if coalesce(p_fee, 0) < 0 then
    raise exception 'Fee cannot be negative';
  end if;

  perform verify_transaction_pin(v_user_id, p_pin);

  v_total := p_amount + coalesce(p_fee, 0);

  select balance into v_balance
  from wallets
  where user_id = v_user_id and currency = p_currency
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for currency %', p_currency;
  end if;

  if v_balance < v_total then
    raise exception 'Insufficient balance';
  end if;

  update wallets
  set balance = balance - v_total, updated_at = now()
  where user_id = v_user_id and currency = p_currency;

  insert into bill_payments (
    user_id, category, country, biller_code, biller_name, customer_identifier,
    customer_name, amount, currency, fee, provider
  )
  values (
    v_user_id, p_category, p_country, p_biller_code, p_biller_name, p_customer_identifier,
    p_customer_name, p_amount, p_currency, coalesce(p_fee, 0), p_provider
  )
  returning id into v_bill_id;

  return v_bill_id;
end;
$$;

grant execute on function create_bill_payment(
  bill_category, text, text, text, text, text, numeric, currency, numeric, text, text
) to authenticated;

-- Idempotent, like every other completion function: the provider's synchronous
-- response, its webhook and a reconciliation pass may all report the same
-- success.
create function complete_bill_payment(
  p_bill_payment_id uuid,
  p_provider_reference text default null,
  p_token text default null,
  p_units text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status bill_status;
begin
  select status into v_status
  from bill_payments
  where id = p_bill_payment_id
  for update;

  if v_status is null or v_status not in ('pending', 'processing') then
    return;
  end if;

  update bill_payments
  set status = 'completed',
      provider_reference = coalesce(p_provider_reference, provider_reference),
      token = coalesce(p_token, token),
      units = coalesce(p_units, units)
  where id = p_bill_payment_id;
end;
$$;

revoke execute on function complete_bill_payment(uuid, text, text, text) from public, anon, authenticated;

-- Refunds amount + fee and marks the row 'refunded' rather than 'failed', so a
-- refunded bill is distinguishable in the transactions list from one that
-- failed with the money still out. Idempotent: a double call cannot
-- double-refund, because the status check runs under the row lock.
create function refund_bill_payment(p_bill_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_currency currency;
  v_amount numeric;
  v_fee numeric;
  v_status bill_status;
begin
  select user_id, currency, amount, fee, status
  into v_user_id, v_currency, v_amount, v_fee, v_status
  from bill_payments
  where id = p_bill_payment_id
  for update;

  if v_user_id is null or v_status not in ('pending', 'processing') then
    return;
  end if;

  update wallets
  set balance = balance + v_amount + coalesce(v_fee, 0), updated_at = now()
  where user_id = v_user_id and currency = v_currency;

  update bill_payments
  set status = 'refunded', decline_reason = p_reason
  where id = p_bill_payment_id;
end;
$$;

revoke execute on function refund_bill_payment(uuid, text) from public, anon, authenticated;

-- ============================================================================
-- justpae 0006 — withdrawals: recipients, request, automated payout, admin.
--
-- Shape carried over wholesale, with three deliberate changes noted inline:
--   1. The withdrawal fee comes from app_settings, not a hardcoded 0.01.
--   2. rolling_withdrawal_total exists, so a user cannot split one large
--      withdrawal into several small automated ones.
--   3. The "you can only withdraw a currency you previously deposited" rule is
--      widened to "deposited OR converted into" — see the comment on
--      create_withdrawal_request. The original rule would make this product's
--      core corridor (receive USD, convert to local, withdraw) impossible.
-- ============================================================================

-- ── withdrawal_recipients — one per (user, currency) ────────────────────────
-- Per (user, currency), not per user. A single row per user permanently blocks
-- a user who saved an NGN recipient from ever withdrawing any other currency.
--
-- Payout detail shape by currency: bank account for NGN and GHS, M-Pesa phone
-- number (stored in bank_account_number, with bank_name/bank_code naming the
-- mobile-money scheme) for KES, and a wallet address plus its network for
-- USDT. The check constraint enforces "bank details or an address", not which
-- of the two a given currency should use — that is the application's job,
-- since the right answer changes per corridor.
create table withdrawal_recipients (
  user_id uuid not null references profiles (id) on delete cascade,
  currency currency not null,
  account_holder_name text not null,
  bank_account_number text,
  bank_name text,
  wallet_address text,
  bank_code text,
  network text,
  busha_recipient_id text,
  pending_change_requested_at timestamptz,
  recipient_changed_at timestamptz,
  recipient_changed_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  primary key (user_id, currency),
  constraint withdrawal_recipients_has_payout_details check (
    (bank_account_number is not null and bank_name is not null) or wallet_address is not null
  )
);

alter table withdrawal_recipients enable row level security;

create policy "withdrawal_recipients: read own" on withdrawal_recipients for select using (auth.uid() = user_id);
-- No insert/update policy: written only via the functions below, which check
-- the account holder name against the KYC name on file before writing. That
-- check is what blocks paying out to a third party.

-- First-time setup for a currency. Adding a NEW currency's first recipient is
-- ungated; replacing an existing one requires the password-re-verified change
-- flow (request_recipient_change / confirm_recipient_change).
create function set_withdrawal_recipient(
  p_currency currency,
  p_account_holder_name text,
  p_bank_account_number text,
  p_bank_name text,
  p_wallet_address text,
  p_bank_code text,
  p_network text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_kyc_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from withdrawal_recipients where user_id = v_user_id and currency = p_currency) then
    raise exception 'A % payout recipient is already on file. Changing it requires verification.', p_currency;
  end if;

  if not exists (select 1 from wallets where user_id = v_user_id and currency = p_currency) then
    raise exception 'You do not have a % wallet', p_currency;
  end if;

  select full_name into v_kyc_name from profiles where id = v_user_id;

  if v_kyc_name is null or trim(lower(v_kyc_name)) <> trim(lower(p_account_holder_name)) then
    raise exception 'Account holder name must match the name on your verified profile';
  end if;

  insert into withdrawal_recipients (
    user_id, currency, account_holder_name, bank_account_number, bank_name,
    wallet_address, bank_code, network
  )
  values (
    v_user_id, p_currency, p_account_holder_name, p_bank_account_number, p_bank_name,
    p_wallet_address, p_bank_code, p_network
  );
end;
$$;

grant execute on function set_withdrawal_recipient(currency, text, text, text, text, text, text) to authenticated;

-- Marks that a change was properly requested. The password check itself happens
-- in the TS action via signInWithPassword — a Postgres function cannot verify a
-- Supabase Auth password hash — so this records the request and
-- confirm_recipient_change refuses to act on a stale or absent one.
create function request_recipient_change(p_currency currency)
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

  if not exists (select 1 from withdrawal_recipients where user_id = v_user_id and currency = p_currency) then
    raise exception 'No existing % recipient to change', p_currency;
  end if;

  update withdrawal_recipients
  set pending_change_requested_at = now()
  where user_id = v_user_id and currency = p_currency;
end;
$$;

grant execute on function request_recipient_change(currency) to authenticated;

create function confirm_recipient_change(
  p_currency currency,
  p_account_holder_name text,
  p_bank_account_number text,
  p_bank_name text,
  p_wallet_address text,
  p_bank_code text,
  p_network text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_kyc_name text;
  v_requested_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select pending_change_requested_at into v_requested_at
  from withdrawal_recipients
  where user_id = v_user_id and currency = p_currency
  for update;

  -- Flow integrity: this cannot be called cold, only within 10 minutes of a
  -- password-verified request_recipient_change.
  if v_requested_at is null or v_requested_at < now() - interval '10 minutes' then
    raise exception 'Start the change request again';
  end if;

  select full_name into v_kyc_name from profiles where id = v_user_id;

  if v_kyc_name is null or trim(lower(v_kyc_name)) <> trim(lower(p_account_holder_name)) then
    raise exception 'Account holder name must match the name on your verified profile';
  end if;

  update withdrawal_recipients
  set account_holder_name = p_account_holder_name,
      bank_account_number = p_bank_account_number,
      bank_name = p_bank_name,
      wallet_address = p_wallet_address,
      bank_code = p_bank_code,
      network = p_network,
      -- A changed recipient must get a fresh provider-side recipient on the
      -- next payout rather than reusing the old one's id.
      busha_recipient_id = null,
      pending_change_requested_at = null,
      recipient_changed_at = now(),
      recipient_changed_by = v_user_id
  where user_id = v_user_id and currency = p_currency;
end;
$$;

grant execute on function confirm_recipient_change(currency, text, text, text, text, text, text) to authenticated;

-- Records the provider-side recipient id after it is first created, so the
-- next payout for the same recipient reuses it. Server-only.
create function set_busha_recipient_id(p_user_id uuid, p_currency currency, p_recipient_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update withdrawal_recipients
  set busha_recipient_id = p_recipient_id
  where user_id = p_user_id and currency = p_currency;
end;
$$;

revoke execute on function set_busha_recipient_id(uuid, currency, text) from public, anon, authenticated;

-- ── create_withdrawal_request ──────────────────────────────────────────────
create function create_withdrawal_request(
  p_currency currency,
  p_amount numeric,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_kyc_status kyc_status;
  v_has_origin boolean;
  v_balance numeric;
  v_fee_rate numeric;
  v_fee numeric;
  v_net_amount numeric;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  -- KYC is checked HERE, not only in the UI. A UI-only restriction is bypassed
  -- by calling the RPC directly.
  select kyc_status into v_kyc_status from profiles where id = v_user_id;
  if v_kyc_status is distinct from 'approved' then
    raise exception 'Identity verification is required before you can withdraw';
  end if;

  perform verify_transaction_pin(v_user_id, p_pin);

  if not exists (select 1 from withdrawal_recipients where user_id = v_user_id and currency = p_currency) then
    raise exception 'Add a payout recipient for % before requesting a withdrawal', p_currency;
  end if;

  -- The funds must have a traceable origin in THIS currency. The original rule
  -- required a completed deposit in the currency, which predates conversions
  -- being a first-class flow: a user who receives USD, converts it to NGN and
  -- wants to withdraw NGN has never deposited NGN, and the original rule would
  -- block the product's core corridor outright. A completed conversion INTO
  -- the currency counts as an origin for the same reason a deposit does.
  select exists(
    select 1 from deposits
    where user_id = v_user_id and currency = p_currency and status = 'completed'
    union all
    select 1 from transactions
    where user_id = v_user_id and type = 'convert' and target_currency = p_currency and status = 'completed'
  ) into v_has_origin;

  if not v_has_origin then
    raise exception 'Deposit or convert into % before withdrawing it', p_currency;
  end if;

  select balance into v_balance
  from wallets
  where user_id = v_user_id and currency = p_currency
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for currency %', p_currency;
  end if;

  if v_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  -- Operator-tunable rather than a hardcoded 1%. A missing or unparseable row
  -- must never break a withdrawal, so it falls back to the same default the TS
  -- layer documents.
  select coalesce(nullif(value, '')::numeric, 0.01) into v_fee_rate
  from app_settings where key = 'withdrawal_fee_rate';
  v_fee_rate := coalesce(v_fee_rate, 0.01);

  v_fee := round(p_amount * v_fee_rate, 2);
  v_net_amount := p_amount - v_fee;

  if v_net_amount <= 0 then
    raise exception 'Amount is too small to cover the withdrawal fee';
  end if;

  -- The wallet is debited for the FULL amount; target_amount records what the
  -- recipient actually receives net of fee.
  update wallets
  set balance = balance - p_amount, updated_at = now()
  where user_id = v_user_id and currency = p_currency;

  insert into transactions (
    user_id, type, provider, status, amount, currency, target_currency, target_amount, fee
  )
  values (
    v_user_id, 'withdrawal', 'manual', 'pending', p_amount, p_currency, p_currency, v_net_amount, v_fee
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$;

grant execute on function create_withdrawal_request(currency, numeric, text) to authenticated;

-- ── rolling_withdrawal_total ───────────────────────────────────────────────
-- Per-currency total of a user's withdrawals over a rolling window, used to
-- check the SAME threshold the single-withdrawal check uses. Without this, a
-- user can keep every individual withdrawal under the automation threshold and
-- move an unlimited amount per day with no review at all.
--
-- Counts everything not failed — pending, processing and completed — so a
-- burst submitted back to back within the window is caught rather than each
-- request seeing an empty history. Returns per-currency rows; the TS caller
-- converts each to its USD equivalent and sums, because a cross-currency sum
-- is meaningless in SQL here.
create function rolling_withdrawal_total(p_user_id uuid, p_hours integer)
returns table (currency currency, total numeric)
language sql
security definer
set search_path = public
as $$
  select t.currency, sum(t.amount)::numeric as total
  from transactions t
  where t.user_id = p_user_id
    and t.type = 'withdrawal'
    and t.status <> 'failed'
    and t.created_at >= now() - (p_hours || ' hours')::interval
  group by t.currency;
$$;

revoke execute on function rolling_withdrawal_total(uuid, integer) from public, anon, authenticated;

-- ── System RPCs for the automated payout path ──────────────────────────────
-- Called only from server code via the service-role client.

-- Flips the row to the provider once a real transfer exists, which is also
-- what makes it visible to the reconciliation cron (that cron only polls
-- provider = 'busha' rows).
create function mark_withdrawal_processing(p_transaction_id uuid, p_provider_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set provider = 'busha',
      status = 'processing',
      provider_reference = p_provider_reference,
      automated_payout_attempt_failed_reason = null
  where id = p_transaction_id and type = 'withdrawal' and status = 'pending';
end;
$$;

revoke execute on function mark_withdrawal_processing(uuid, text) from public, anon, authenticated;

create function complete_withdrawal_payout(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set status = 'completed'
  where id = p_transaction_id and type = 'withdrawal' and status in ('pending', 'processing');
end;
$$;

revoke execute on function complete_withdrawal_payout(uuid) from public, anon, authenticated;

-- Refunds the wallet. A debited withdrawal must never be stranded: the debit
-- happened when the request was created, so any terminal failure has to put it
-- back.
create function fail_withdrawal_payout(p_transaction_id uuid, p_reason text default null)
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
  select user_id, amount, currency, status
  into v_user_id, v_amount, v_currency, v_status
  from transactions
  where id = p_transaction_id and type = 'withdrawal'
  for update;

  if v_user_id is null or v_status not in ('pending', 'processing') then
    return;
  end if;

  update wallets
  set balance = balance + v_amount, updated_at = now()
  where user_id = v_user_id and currency = v_currency;

  update transactions
  set status = 'failed', decline_reason = p_reason
  where id = p_transaction_id;
end;
$$;

revoke execute on function fail_withdrawal_payout(uuid, text) from public, anon, authenticated;

-- Called when the amount (or the rolling window total) exceeds the automation
-- threshold: the withdrawal stays in the manual queue, flagged.
create function flag_withdrawal_for_verification(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set requires_extra_verification = true
  where id = p_transaction_id and type = 'withdrawal';
end;
$$;

revoke execute on function flag_withdrawal_for_verification(uuid) from public, anon, authenticated;

-- Records a failure that happened BEFORE a provider transfer existed (rate
-- probe, recipient creation, provider API error). Without this the row sits
-- exactly as create_withdrawal_request left it — provider 'manual', status
-- 'pending' — invisible to the reconcile cron and indistinguishable in the
-- admin queue from a legitimately-manual above-threshold withdrawal.
create function record_automated_payout_failure(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set automated_payout_attempt_failed_reason = p_reason,
      automated_payout_retry_count = automated_payout_retry_count + 1
  where id = p_transaction_id and type = 'withdrawal';
end;
$$;

revoke execute on function record_automated_payout_failure(uuid, text) from public, anon, authenticated;

-- ── Admin queue ────────────────────────────────────────────────────────────
create function admin_confirm_withdrawal_verification(p_transaction_id uuid, p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set extra_verification_confirmed_at = now(), extra_verification_confirmed_by = p_admin_id
  where id = p_transaction_id and type = 'withdrawal' and requires_extra_verification;
end;
$$;

revoke execute on function admin_confirm_withdrawal_verification(uuid, uuid) from public, anon, authenticated;

create function admin_complete_withdrawal(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requires_verification boolean;
  v_verified_at timestamptz;
begin
  select requires_extra_verification, extra_verification_confirmed_at
  into v_requires_verification, v_verified_at
  from transactions
  where id = p_transaction_id and type = 'withdrawal';

  if v_requires_verification and v_verified_at is null then
    raise exception 'Additional verification required before this can be marked paid out';
  end if;

  update transactions
  set status = 'completed'
  where id = p_transaction_id and type = 'withdrawal' and status in ('pending', 'processing');
end;
$$;

revoke execute on function admin_complete_withdrawal(uuid) from public, anon, authenticated;

create function admin_reject_withdrawal(p_transaction_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Same refund path as a provider failure — an admin rejection must not
  -- strand the debit either.
  perform fail_withdrawal_payout(p_transaction_id, p_reason);
end;
$$;

revoke execute on function admin_reject_withdrawal(uuid, text) from public, anon, authenticated;

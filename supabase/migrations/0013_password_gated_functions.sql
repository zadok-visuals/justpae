-- ============================================================================
-- justpae 0012 — a TypeScript password check must gate a TypeScript caller.
--
-- WHAT WAS WRONG
--
-- Three functions were granted to `authenticated` with a comment explaining
-- that the password re-check "happens in the TS action":
--
--   change_withdrawal_pin      — replaces the PIN that authorises every
--                                money-out action
--   request_recipient_change   — opens the 10-minute window
--   confirm_recipient_change   — rewrites the payout destination inside it
--
-- The comment is accurate and the reasoning behind it is sound: a Postgres
-- function genuinely cannot verify a Supabase Auth password hash, so the check
-- has to live in TS. What does not follow is leaving the functions reachable
-- from the session afterwards. The server action is one caller among many; the
-- session's own anon-key client is another, and it skips the password check by
-- simply not being the server action.
--
-- Concretely, with nothing but a stolen session token — no password:
--
--   rpc('request_recipient_change', { p_currency: 'NGN' })
--   rpc('confirm_recipient_change', { p_currency: 'NGN', ... attacker bank ... })
--   rpc('change_withdrawal_pin',    { p_pin: '000000' })
--
-- …is a complete account takeover of the payout path. The account holder name
-- still has to match the KYC name on file, which is a real obstacle, but it is
-- one an attacker satisfies by typing the victim's own name — it constrains the
-- name on the destination account, not who owns it.
--
-- THE FIX: revoke all three. The server actions re-verify the password with
-- signInWithPassword exactly as before, then call *_for_user variants through
-- the service-role client, passing the user id from the verified session. The
-- TS gate now sits in front of the only door, instead of beside it.
--
-- ALSO HERE: the 24-hour hold. Re-verifying a password is the right gate, but
-- it is a gate an attacker who has the password passes too. A changed payout
-- destination therefore cannot receive an AUTOMATED payout for 24 hours —
-- withdrawals to it route to the admin queue, which puts a human and a delay
-- between a compromised account and the money leaving.
-- ============================================================================

-- ── 1. change_withdrawal_pin → change_withdrawal_pin_for_user ──────────────
revoke execute on function change_withdrawal_pin(text) from public, anon, authenticated;
drop function change_withdrawal_pin(text);

-- PIN format rules live in 0013, which also adds the lockout columns; this
-- function delegates to the shared validator created there. Ordering note: 0013
-- runs after this file, so the validator is referenced by name and resolved at
-- call time (plpgsql is late-binding), not at creation time.
create function change_withdrawal_pin_for_user(p_user_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from withdrawal_pins where user_id = p_user_id) then
    raise exception 'No transaction PIN is set yet';
  end if;

  perform assert_pin_acceptable(p_pin);

  update withdrawal_pins
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      updated_at = now(),
      -- A deliberate PIN change clears a lockout. The user has just proved
      -- account ownership with their password, which is a stronger signal than
      -- the failed-PIN counter the lockout was built from.
      failed_attempts = 0,
      locked_until = null
  where user_id = p_user_id;
end;
$$;

revoke execute on function change_withdrawal_pin_for_user(uuid, text) from public, anon, authenticated;

-- ── 2. set_withdrawal_pin — first-time setup ───────────────────────────────
-- Left reachable from the session: it refuses outright if a PIN already exists,
-- so the worst a caller can do is set the PIN on an account that has none —
-- which is the account owner's own first-run action and moves no money. It is
-- recreated here only to pick up the shared format validator.
revoke execute on function set_withdrawal_pin(text) from public, anon, authenticated;
drop function set_withdrawal_pin(text);

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

  perform assert_pin_acceptable(p_pin);

  insert into withdrawal_pins (user_id, pin_hash)
  values (v_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf')));
end;
$$;

grant execute on function set_withdrawal_pin(text) to authenticated;

-- ── 3. The recipient change pair ────────────────────────────────────────────
revoke execute on function request_recipient_change(currency) from public, anon, authenticated;
drop function request_recipient_change(currency);

revoke execute on function confirm_recipient_change(currency, text, text, text, text, text, text)
  from public, anon, authenticated;
drop function confirm_recipient_change(currency, text, text, text, text, text, text);

create function request_recipient_change_for_user(p_user_id uuid, p_currency currency)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from withdrawal_recipients where user_id = p_user_id and currency = p_currency
  ) then
    raise exception 'No existing % recipient to change', p_currency;
  end if;

  update withdrawal_recipients
  set pending_change_requested_at = now()
  where user_id = p_user_id and currency = p_currency;
end;
$$;

revoke execute on function request_recipient_change_for_user(uuid, currency) from public, anon, authenticated;

-- Returns the OLD destination as well as writing the new one, so the server
-- action can tell the user in the notification email what changed — "your NGN
-- payout account was changed" is a warning; "…from ****1234 to ****9876" is an
-- actionable one. Only the masked tail is returned, never a full account
-- number.
create function confirm_recipient_change_for_user(
  p_user_id uuid,
  p_currency currency,
  p_account_holder_name text,
  p_bank_account_number text,
  p_bank_name text,
  p_wallet_address text,
  p_bank_code text,
  p_network text
)
returns table (previous_destination text, new_destination text, hold_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kyc_name text;
  v_requested_at timestamptz;
  v_old record;
  v_hold_until timestamptz;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_old
  from withdrawal_recipients
  where user_id = p_user_id and currency = p_currency
  for update;

  if v_old.user_id is null then
    raise exception 'No existing % recipient to change', p_currency;
  end if;

  v_requested_at := v_old.pending_change_requested_at;

  -- Flow integrity: this cannot be called cold, only within 10 minutes of a
  -- password-verified request_recipient_change_for_user.
  if v_requested_at is null or v_requested_at < now() - interval '10 minutes' then
    raise exception 'Start the change request again';
  end if;

  select full_name into v_kyc_name from profiles where id = p_user_id;

  if v_kyc_name is null or trim(lower(v_kyc_name)) <> trim(lower(p_account_holder_name)) then
    raise exception 'Account holder name must match the name on your verified profile';
  end if;

  v_hold_until := now() + interval '24 hours';

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
      recipient_changed_by = p_user_id
  where user_id = p_user_id and currency = p_currency;

  return query select
    mask_destination(v_old.bank_account_number, v_old.wallet_address),
    mask_destination(p_bank_account_number, p_wallet_address),
    v_hold_until;
end;
$$;

revoke execute on function confirm_recipient_change_for_user(
  uuid, currency, text, text, text, text, text, text
) from public, anon, authenticated;

-- Last four characters only. Used in the notification email, which lands in an
-- inbox that may itself be compromised — the whole point of the email is that
-- it is readable enough to recognise and useless enough to leak.
create function mask_destination(p_account_number text, p_wallet_address text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_account_number, '') <> '' then
      '••••' || right(p_account_number, 4)
    when coalesce(p_wallet_address, '') <> '' then
      left(p_wallet_address, 6) || '…' || right(p_wallet_address, 4)
    else null
  end;
$$;

-- Pure string arithmetic on its own arguments, so there is nothing here to
-- leak — but Postgres grants EXECUTE to PUBLIC by default, and this codebase's
-- rule is that a server-only function is explicitly revoked rather than left
-- callable because it happens to be harmless.
revoke execute on function mask_destination(text, text) from public, anon, authenticated;

-- ── 4. The 24-hour automated-payout hold ───────────────────────────────────
create function recipient_change_hold_active(p_user_id uuid, p_currency currency)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select recipient_changed_at > now() - interval '24 hours'
      from withdrawal_recipients
      where user_id = p_user_id and currency = p_currency
    ),
    false
  );
$$;

-- Takes an arbitrary user id, so it stays server-only: granted to
-- `authenticated` it would answer "did this other person just change their
-- payout account" for any user id.
revoke execute on function recipient_change_hold_active(uuid, currency) from public, anon, authenticated;

-- The session-scoped version, for /withdraw to warn BEFORE the user submits
-- that this one will wait for approval. auth.uid() only, so it can answer only
-- about the caller — who already knows, since they made the change.
create function my_recipient_change_hold_active(p_currency currency)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select recipient_change_hold_active(auth.uid(), p_currency);
$$;

grant execute on function my_recipient_change_hold_active(currency) to authenticated;

-- ── 5. create_withdrawal_request — enforce the hold in SQL ─────────────────
-- Recreated to flag rows inside the hold window for extra verification. Doing
-- it here rather than only in the TS payout path is the difference between a
-- hold and a suggestion: attemptAutomatedPayout also checks, but it is the
-- caller, and the caller is the thing the hold exists to not depend on.
revoke execute on function create_withdrawal_request(currency, numeric, text) from public, anon, authenticated;
drop function create_withdrawal_request(currency, numeric, text);

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
  v_hold boolean;
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

  -- The funds must have a traceable origin in THIS currency: a completed
  -- deposit, or a completed conversion into it.
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

  select coalesce(nullif(value, '')::numeric, 0.01) into v_fee_rate
  from app_settings where key = 'withdrawal_fee_rate';
  v_fee_rate := coalesce(v_fee_rate, 0.01);

  v_fee := round(p_amount * v_fee_rate, 2);
  v_net_amount := p_amount - v_fee;

  if v_net_amount <= 0 then
    raise exception 'Amount is too small to cover the withdrawal fee';
  end if;

  update wallets
  set balance = balance - p_amount, updated_at = now()
  where user_id = v_user_id and currency = p_currency;

  v_hold := recipient_change_hold_active(v_user_id, p_currency);

  insert into transactions (
    user_id, type, provider, status, amount, currency, target_currency, target_amount, fee,
    requires_extra_verification
  )
  values (
    v_user_id, 'withdrawal', 'manual', 'pending', p_amount, p_currency, p_currency, v_net_amount, v_fee,
    v_hold
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$;

grant execute on function create_withdrawal_request(currency, numeric, text) to authenticated;

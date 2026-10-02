-- ============================================================================
-- justpae 0005 — conversions (/convert).
--
-- Debit-then-record, all inside one function, with the source wallet row
-- locked so a double-submit cannot spend the same balance twice.
--
-- The full rate audit trail is written at creation time:
--   provider_rate      the raw rate the provider quoted, pre-markup
--   markup_rate        the fraction applied, e.g. 0.005 for 0.5%
--   customer_rate      what the customer was shown and settled at
--   raw_target_amount  what the provider delivered, pre-markup
--   target_amount      what the customer is credited
-- raw_target_amount minus target_amount IS the margin on the order. Recording
-- it at creation rather than deriving it later is the only way /admin/pnl can
-- report profit per order after the fact — a rate read and then discarded is
-- unrecoverable once the order completes.
--
-- The server recomputes the quote immediately before calling this and passes
-- its own figures; a client-supplied rate is never trusted. The PIN is checked
-- here, inside the transaction, not in the UI.
-- ============================================================================

create function create_conversion(
  p_source_currency currency,
  p_target_currency currency,
  p_source_amount numeric,
  p_target_amount numeric,
  p_provider_reference text,
  p_provider_rate numeric,
  p_markup_rate numeric,
  p_customer_rate numeric,
  p_raw_target_amount numeric,
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
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_source_currency = p_target_currency then
    raise exception 'Pick two different wallets';
  end if;

  if p_source_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if p_target_amount <= 0 then
    raise exception 'Converted amount must be greater than zero';
  end if;

  perform verify_transaction_pin(v_user_id, p_pin);

  -- The destination wallet must exist before the conversion starts, otherwise
  -- completion has nowhere to credit and the source balance is already gone.
  if not exists (select 1 from wallets where user_id = v_user_id and currency = p_target_currency) then
    raise exception 'You do not have a % wallet', p_target_currency;
  end if;

  select balance into v_balance
  from wallets
  where user_id = v_user_id and currency = p_source_currency
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for currency %', p_source_currency;
  end if;

  if v_balance < p_source_amount then
    raise exception 'Insufficient balance';
  end if;

  update wallets
  set balance = balance - p_source_amount, updated_at = now()
  where user_id = v_user_id and currency = p_source_currency;

  insert into transactions (
    user_id, type, provider, status, amount, currency,
    target_currency, target_amount, provider_reference,
    provider_rate, markup_rate, customer_rate, raw_target_amount
  )
  values (
    v_user_id, 'convert', 'busha', 'pending', p_source_amount, p_source_currency,
    p_target_currency, p_target_amount, p_provider_reference,
    p_provider_rate, p_markup_rate, p_customer_rate, p_raw_target_amount
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$;

grant execute on function create_conversion(
  currency, currency, numeric, numeric, text, numeric, numeric, numeric, numeric, text
) to authenticated;

-- Credits the target wallet and marks the row completed. Idempotent: called
-- from the user-facing flow when the provider confirms synchronously, from the
-- webhook when it confirms later, and from the reconcile cron if neither
-- landed. All three may fire for the same row.
create function complete_conversion(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_target_currency currency;
  v_target_amount numeric;
  v_actual_target_amount numeric;
  v_status transaction_status;
  v_credit numeric;
begin
  select user_id, target_currency, target_amount, actual_target_amount, status
  into v_user_id, v_target_currency, v_target_amount, v_actual_target_amount, v_status
  from transactions
  where id = p_transaction_id and type = 'convert'
  for update;

  if v_user_id is null or v_status not in ('pending', 'processing') then
    return;
  end if;

  -- actual_target_amount is set by the reconciler when the provider delivered
  -- something other than the quote. It is already markup-adjusted by the
  -- caller, so it is credited as-is when present.
  v_credit := coalesce(v_actual_target_amount, v_target_amount);

  update wallets
  set balance = balance + v_credit, updated_at = now()
  where user_id = v_user_id and currency = v_target_currency;

  update transactions
  set status = 'completed'
  where id = p_transaction_id;
end;
$$;

revoke execute on function complete_conversion(uuid) from public, anon, authenticated;

-- Refunds the debited source amount. A failed conversion must never leave the
-- user short: the debit happened at creation, so failure has to put it back.
create function fail_conversion(p_transaction_id uuid, p_reason text default null)
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
  where id = p_transaction_id and type = 'convert'
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

revoke execute on function fail_conversion(uuid, text) from public, anon, authenticated;

-- Lets the owning session attach the real provider transfer id once it is
-- known. The conversion is created with the quote id as a placeholder, because
-- the transfer does not exist until after the balance has been debited.
create function set_transaction_provider_reference(
  p_transaction_id uuid,
  p_provider_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set provider_reference = p_provider_reference
  where id = p_transaction_id and user_id = auth.uid();
end;
$$;

grant execute on function set_transaction_provider_reference(uuid, text) to authenticated;

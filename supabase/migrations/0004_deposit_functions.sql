-- ============================================================================
-- justpae 0004 — deposit credit / fail.
--
-- Both are idempotent and no-op (rather than raise) when the deposit is not
-- pending, because both are called from more than one place for the same row:
-- the provider webhook, the user-facing status poll, and the reconcile cron.
-- Webhook retries and a cron pass crossing a webhook must both be safe.
--
-- Neither is granted to `authenticated`. A deposit is credited only from the
-- server, only after a verified webhook or a provider-side re-fetch — never on
-- a client's word that money arrived.
-- ============================================================================

create function credit_deposit(p_deposit_id uuid, p_actual_amount numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_currency currency;
  v_amount numeric;
  v_status transaction_status;
  v_credit_amount numeric;
begin
  select user_id, currency, amount, status
  into v_user_id, v_currency, v_amount, v_status
  from deposits
  where id = p_deposit_id
  for update;

  if v_user_id is null or v_status <> 'pending' then
    return;
  end if;

  -- Credit what actually arrived, not what was originally requested. The
  -- caller passes the provider's freshly re-fetched confirmed amount; the
  -- requested amount is only the fallback for a provider that offers no
  -- equivalent re-check.
  v_credit_amount := coalesce(p_actual_amount, v_amount);

  if v_credit_amount <= 0 then
    raise exception 'Refusing to credit a non-positive amount';
  end if;

  -- The wallet may not exist: a user whose country provisioned no local wallet
  -- could still be sent a deposit in that currency. Provision on credit rather
  -- than dropping the money on the floor.
  insert into wallets (user_id, currency, balance)
  values (v_user_id, v_currency, 0)
  on conflict (user_id, currency) do nothing;

  update wallets
  set balance = balance + v_credit_amount, updated_at = now()
  where user_id = v_user_id and currency = v_currency;

  update deposits
  set status = 'completed', confirmed_amount = v_credit_amount
  where id = p_deposit_id;
end;
$$;

revoke execute on function credit_deposit(uuid, numeric) from public, anon, authenticated;

-- The counterpart to credit_deposit. Without it, a pay-in that expires or is
-- cancelled on the provider's side has no path out of 'pending' and sits there
-- forever, indistinguishable from one still genuinely in flight.
create function fail_deposit(p_deposit_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status transaction_status;
begin
  select status into v_status
  from deposits
  where id = p_deposit_id
  for update;

  if v_status is null or v_status <> 'pending' then
    return;
  end if;

  update deposits
  set status = 'failed', decline_reason = p_reason
  where id = p_deposit_id;
end;
$$;

revoke execute on function fail_deposit(uuid, text) from public, anon, authenticated;

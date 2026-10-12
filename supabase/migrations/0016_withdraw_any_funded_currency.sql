-- ============================================================================
-- justpae 0016 — withdraw any currency you actually hold.
--
-- WHAT CHANGES. create_withdrawal_request required a traceable ORIGIN in the
-- withdrawn currency: a completed deposit, or (as widened in 0006) a completed
-- conversion into it. That check is removed.
--
-- WHY IT HAS TO GO. The rule was inherited from an architecture where a deposit
-- was the only way money entered a wallet, and it fails for every other way
-- money legitimately gets there:
--
--   - A refunded bill payment credits the wallet via refund_bill_payment. The
--     refund is not a deposit and not a conversion, so a user whose only
--     NGN came back from a failed electricity payment could not withdraw it.
--   - A failed conversion refunds the SOURCE currency via fail_conversion. If
--     that source balance originally arrived by some path the check doesn't
--     recognise, it is stranded.
--   - Any operational credit an admin makes has no origin row of either kind.
--
-- In each case the money is genuinely the user's, sitting in their wallet, and
-- the product refused to pay it out — which is the worst possible failure for a
-- payments product to have: "we are holding your money and will not say why in
-- terms you can act on."
--
-- WHY THAT IS SAFE. The origin check never protected the balance; the BALANCE
-- protects the balance. `select … for update` plus `v_balance < p_amount`
-- is what makes it impossible to withdraw money you do not have, and that is
-- untouched. Every other gate is untouched too: KYC approval, the transaction
-- PIN (with the 0012 lockout), a saved recipient for this currency whose
-- account holder name matches the verified profile name, the fee from
-- app_settings, the 24-hour hold after a recipient change, and the
-- above-threshold routing to manual review.
--
-- What the origin check did provide was a weak trace of where funds came from.
-- That information has not been lost — it is still fully reconstructible from
-- the deposits and transactions tables, which is where an actual audit would
-- look. It just no longer blocks a payout.
-- ============================================================================

create or replace function create_withdrawal_request(
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

  -- The origin check that used to sit here is gone. See the header.

  select balance into v_balance
  from wallets
  where user_id = v_user_id and currency = p_currency
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for currency %', p_currency;
  end if;

  -- This is, and always was, the check that matters.
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

-- Re-assert: this file redefines a function that IS granted to authenticated,
-- which is exactly the kind of change the 0014 invariants exist to police.
do $$
begin
  perform assert_phase1_invariants();
end;
$$;

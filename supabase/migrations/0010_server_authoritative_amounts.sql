-- ============================================================================
-- justpae 0010 — the client never names an amount again.
--
-- WHAT WAS WRONG
--
-- create_conversion was granted to `authenticated` and took p_target_amount,
-- p_provider_rate, p_markup_rate, p_customer_rate, p_raw_target_amount AND
-- p_provider_reference straight from the caller. The server action was careful
-- to recompute all of them — but the server action is not the only caller. Any
-- user holding their own anon-key session could call the RPC directly with:
--
--   p_source_amount      0.01
--   p_target_amount      10000000
--   p_provider_reference <the id of one of their OWN earlier, completed
--                         transfers — readable from their own transactions row>
--
-- …and get a pending conversion row that the reconcile cron would then look up
-- against a genuinely-completed provider transfer and settle via
-- complete_conversion, crediting the ten million they named. The debit side was
-- enforced; the credit side was whatever the caller typed.
--
-- create_bill_payment had the same shape with p_fee: a caller could pass a
-- negative-adjacent zero fee, or the server's fee could be contradicted
-- outright, because the number arrived from outside.
--
-- THE FIX, in one sentence: a money-moving function takes an IDENTIFIER and a
-- PIN, never a figure. Figures come from a row the server wrote with the
-- service role, or from app_settings, and nothing else.
--
-- Four parts:
--   1. conversion_quotes — the server's own record of what it priced, written
--      with the service role, locked and consumed exactly once.
--   2. create_conversion_from_quote — reads every figure off that row.
--   3. create_bill_payment_for_user — fee read from app_settings in-function.
--   4. A unique index on (provider, provider_reference) so one real provider
--      transfer can back at most one ledger row, forever, even if some future
--      code path forgets.
-- ============================================================================

-- ── 1. conversion_quotes ────────────────────────────────────────────────────
-- Written ONLY by server code holding the service role, after the provider has
-- been called and has reported its own real figures. RLS is on with no policies
-- at all, so `authenticated` and `anon` can neither read nor write it; the
-- service role bypasses RLS by design and is the only writer.
--
-- Keeping provider_reference here rather than taking it as a function argument
-- is the other half of the fix: the reference is attached by the same server
-- code that made the provider call, in the same breath as the amounts it
-- returned, so a caller can never point a new row at someone else's transfer.
create table conversion_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  source_currency currency not null,
  target_currency currency not null,
  source_amount numeric(18, 2) not null,
  target_amount numeric(18, 2) not null,
  provider_rate numeric(24, 10),
  markup_rate numeric(10, 6),
  customer_rate numeric(24, 10),
  raw_target_amount numeric(18, 2),
  -- The provider transfer this quote was priced against, set by server code
  -- after the provider call returned. Never supplied by a caller.
  provider_reference text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint conversion_quotes_amounts_positive check (source_amount > 0 and target_amount > 0),
  constraint conversion_quotes_distinct_currencies check (source_currency <> target_currency)
);

create index conversion_quotes_user_created_idx on conversion_quotes (user_id, created_at desc);
-- Supports the cleanup of stale unconsumed quotes.
create index conversion_quotes_expiry_idx on conversion_quotes (expires_at) where consumed_at is null;

alter table conversion_quotes enable row level security;

-- Deliberately NO policies. RLS with zero policies denies everything to every
-- role that goes through RLS, which is exactly the intent: a user must not be
-- able to read the rate audit trail before it is settled, and must never be
-- able to write a quote. Belt and braces, the table grants are revoked too —
-- an accidental policy added later still can't help a role with no table
-- privilege.
revoke all on table conversion_quotes from public, anon, authenticated;

-- ── 2. create_conversion_from_quote ─────────────────────────────────────────
-- Replaces create_conversion. Takes an id and a PIN. Every figure on the
-- resulting transaction row is read off the locked quote.
--
-- p_user_id comes from supabase.auth.getUser() in the server action — i.e. from
-- a verified JWT, server-side — and NOT from auth.uid(), because this function
-- is called through the service-role client where auth.uid() is null. The quote
-- row's own user_id is re-checked against it, so a stolen or guessed quote id
-- belonging to another user is rejected rather than honoured.
create function create_conversion_from_quote(
  p_user_id uuid,
  p_quote_id uuid,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote conversion_quotes%rowtype;
  v_balance numeric;
  v_transaction_id uuid;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- FOR UPDATE on the quote is what makes "consumed exactly once" true under
  -- concurrency: two simultaneous submissions of the same quote serialise here,
  -- and the second one sees consumed_at already set.
  select * into v_quote
  from conversion_quotes
  where id = p_quote_id
  for update;

  -- Deliberately the same message for "no such quote" and "someone else's
  -- quote": distinguishing them turns this into an oracle for whether a given
  -- uuid exists.
  if v_quote.id is null or v_quote.user_id <> p_user_id then
    raise exception 'That quote is no longer valid. Please try again.';
  end if;

  if v_quote.consumed_at is not null then
    raise exception 'That quote has already been used.';
  end if;

  if v_quote.expires_at <= now() then
    raise exception 'That quote has expired. Please try again.';
  end if;

  perform verify_transaction_pin(p_user_id, p_pin);

  -- The destination wallet must exist before the debit, otherwise completion
  -- has nowhere to credit and the source balance is already gone.
  if not exists (
    select 1 from wallets where user_id = p_user_id and currency = v_quote.target_currency
  ) then
    raise exception 'You do not have a % wallet', v_quote.target_currency;
  end if;

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
    target_currency, target_amount, provider_reference,
    provider_rate, markup_rate, customer_rate, raw_target_amount
  )
  values (
    p_user_id, 'convert', 'busha', 'pending', v_quote.source_amount, v_quote.source_currency,
    v_quote.target_currency, v_quote.target_amount, v_quote.provider_reference,
    v_quote.provider_rate, v_quote.markup_rate, v_quote.customer_rate, v_quote.raw_target_amount
  )
  returning id into v_transaction_id;

  update conversion_quotes set consumed_at = now() where id = p_quote_id;

  return v_transaction_id;
end;
$$;

revoke execute on function create_conversion_from_quote(uuid, uuid, text) from public, anon, authenticated;

-- ── create_conversion and set_transaction_provider_reference — removed ──────
-- Revoked first so the intent is explicit in the migration history even though
-- the drop that follows is what actually closes it.
revoke execute on function create_conversion(
  currency, currency, numeric, numeric, text, numeric, numeric, numeric, numeric, text
) from public, anon, authenticated;

drop function create_conversion(
  currency, currency, numeric, numeric, text, numeric, numeric, numeric, numeric, text
);

-- set_transaction_provider_reference let the owning session stamp an arbitrary
-- provider reference onto its own transaction row — the second half of the
-- attack above, and on its own enough to re-point a pending row at a completed
-- transfer. Nothing in src/ ever called it (verified by grep across the whole
-- tree; the only remaining mention was a type declaration). The provider
-- reference is now written exclusively by server code, on the quote row, before
-- the transaction row is created.
revoke execute on function set_transaction_provider_reference(uuid, text) from public, anon, authenticated;
drop function set_transaction_provider_reference(uuid, text);

-- ── 3. create_bill_payment — fee comes from settings, not from the caller ───
revoke execute on function create_bill_payment(
  bill_category, text, text, text, text, text, numeric, currency, numeric, text, text
) from public, anon, authenticated;

drop function create_bill_payment(
  bill_category, text, text, text, text, text, numeric, currency, numeric, text, text
);

-- The operator-tunable bill fee, same pattern as withdrawal_fee_rate. Seeded at
-- zero so behaviour is unchanged on deploy — the point of this row is that the
-- number has a single server-side home, not that it starts non-zero.
insert into app_settings (key, value, description)
values ('bill_payment_fee_rate', '0', 'Bill payment fee as a fraction of the amount, e.g. 0.01 for 1%.')
on conflict (key) do nothing;

create function create_bill_payment_for_user(
  p_user_id uuid,
  p_category bill_category,
  p_country text,
  p_biller_code text,
  p_biller_name text,
  p_customer_identifier text,
  p_customer_name text,
  p_amount numeric,
  p_currency currency,
  p_provider text,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_fee_rate numeric;
  v_fee numeric;
  v_total numeric;
  v_bill_id uuid;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  perform verify_transaction_pin(p_user_id, p_pin);

  -- The fee is DERIVED here, in the same transaction that debits, from a row
  -- only an admin can write. There is no argument a caller could pass to
  -- influence it. A missing or unparseable setting falls back to zero rather
  -- than breaking the payment.
  select coalesce(nullif(value, '')::numeric, 0) into v_fee_rate
  from app_settings where key = 'bill_payment_fee_rate';
  v_fee_rate := greatest(coalesce(v_fee_rate, 0), 0);

  v_fee := round(p_amount * v_fee_rate, 2);
  v_total := p_amount + v_fee;

  select balance into v_balance
  from wallets
  where user_id = p_user_id and currency = p_currency
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for currency %', p_currency;
  end if;

  if v_balance < v_total then
    raise exception 'Insufficient balance';
  end if;

  update wallets
  set balance = balance - v_total, updated_at = now()
  where user_id = p_user_id and currency = p_currency;

  insert into bill_payments (
    user_id, category, country, biller_code, biller_name, customer_identifier,
    customer_name, amount, currency, fee, provider
  )
  values (
    p_user_id, p_category, p_country, p_biller_code, p_biller_name, p_customer_identifier,
    p_customer_name, p_amount, p_currency, v_fee, p_provider
  )
  returning id into v_bill_id;

  return v_bill_id;
end;
$$;

revoke execute on function create_bill_payment_for_user(
  uuid, bill_category, text, text, text, text, text, numeric, currency, text, text
) from public, anon, authenticated;

-- Lets the review screen show the fee before the user commits, without
-- exposing any way to change it. Reading app_settings is already permitted to
-- everyone (see 0002's "app_settings: read all"), so this exposes nothing new —
-- it just puts the same arithmetic the debit uses in one place.
create function quote_bill_fee(p_amount numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
    greatest(p_amount, 0) * greatest(
      coalesce((select nullif(value, '')::numeric from app_settings where key = 'bill_payment_fee_rate'), 0),
      0
    ),
    2
  );
$$;

grant execute on function quote_bill_fee(numeric) to authenticated;

-- ── 4. One provider transfer, at most one ledger row ───────────────────────
-- The structural backstop for the whole class of bug above. Even if some future
-- code path forgets every check in this file, a second row claiming an already
-- used provider reference cannot be inserted at all.
--
-- Partial, because provider_reference is legitimately null for the window
-- between a manual withdrawal being requested and a transfer existing, and many
-- rows can be null at once.
create unique index transactions_provider_reference_unique
  on transactions (provider, provider_reference)
  where provider_reference is not null;

-- Same reasoning for deposits — a provider deposit transfer backs exactly one
-- deposit row.
create unique index deposits_provider_reference_unique
  on deposits (provider, provider_reference)
  where provider_reference is not null;

-- ── 5. Manual-review flagging for reconciliation mismatches ────────────────
-- When the provider's own transfer object disagrees with what our row says was
-- being converted, the row must NOT be completed. "Do nothing" is not good
-- enough on its own: a silently-skipped row is indistinguishable from one still
-- in flight, so it is marked, and the reason is kept on the row for whoever
-- looks.
alter table transactions
  add column needs_manual_review boolean not null default false,
  add column manual_review_reason text;

create index transactions_manual_review_idx on transactions (needs_manual_review)
  where needs_manual_review;

create function flag_transaction_for_review(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set needs_manual_review = true,
      manual_review_reason = p_reason
  where id = p_transaction_id;
end;
$$;

revoke execute on function flag_transaction_for_review(uuid, text) from public, anon, authenticated;

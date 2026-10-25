-- ============================================================================
-- justpae 0041 — paying a withdrawal out through the second provider.
--
-- Three things the application layer cannot do for itself:
--
--   1. CLAIM A WITHDRAWAL BEFORE CALLING A PAYOUT API. claim_payout_attempt
--      flips exactly one row from pending to processing and stamps the
--      reference, in one statement. Only the caller that gets `true` is
--      allowed to call the provider, so two crons, a webhook and a retry all
--      firing at once produce one payout. The second line of defence is the
--      unique index transactions_provider_reference_unique from 0010: the
--      reference IS the withdrawal id, so a second row cannot borrow it.
--
--   2. HAND A CLAIM BACK when the provider is asked and says the payout does
--      not exist. release_payout_claim returns the row to pending/manual and
--      increments the retry counter, so the bounded retry still applies. It
--      refuses to act unless the stored reference is the one being released —
--      a stale caller must not be able to un-send a payout that is in flight.
--
--   3. HOLD A WITHDRAWAL FOR AN EMPTY PAYOUT BALANCE without burning a retry.
--      record_payout_balance_hold marks the row for review and leaves
--      automated_payout_retry_count alone, because "we had no naira today" is
--      not the withdrawal's fault and must not use up its three attempts. It
--      returns whether this is the first hold, which is how admins are
--      emailed once per withdrawal rather than every fifteen minutes.
--
-- NOTHING HERE IS CALLABLE BY A USER SESSION. Every function is security
-- definer with a pinned search_path and revoked from public, anon and
-- authenticated, like every money function before it.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1. ONE COLUMN: WAS AN ADMIN ALREADY TOLD ABOUT THIS ONE
-- ════════════════════════════════════════════════════════════════════════════
--
-- A timestamp rather than a boolean, so the answer to "since when" does not
-- need a separate ledger read.

alter table transactions add column if not exists payout_balance_alert_sent_at timestamptz;

comment on column transactions.payout_balance_alert_sent_at is
  'When admins were first emailed that this withdrawal is waiting on the '
  'payout balance. Set once; the retry cron must not re-send it every run.';


-- ════════════════════════════════════════════════════════════════════════════
-- 2. THE CLAIM
-- ════════════════════════════════════════════════════════════════════════════
--
-- Returns true to exactly one caller. A single UPDATE with `status =
-- 'pending'` in its WHERE clause is atomic; a SELECT followed by an UPDATE
-- would not be, and that gap is precisely how a withdrawal gets paid twice.
--
-- It also clears a previous balance hold, because a claim only happens once
-- the balance check has passed.

create function claim_payout_attempt(
  p_transaction_id uuid,
  p_provider transaction_provider,
  p_provider_reference text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed uuid;
begin
  if p_provider_reference is null or p_provider_reference = '' then
    raise exception 'claim_payout_attempt needs a provider reference.';
  end if;

  update transactions
  set provider = p_provider,
      status = 'processing',
      provider_reference = p_provider_reference,
      automated_payout_attempt_failed_reason = null,
      needs_manual_review = false,
      manual_review_reason = null
  where id = p_transaction_id
    and type = 'withdrawal'
    and status = 'pending'
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke execute on function claim_payout_attempt(uuid, transaction_provider, text)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. HANDING THE CLAIM BACK
-- ════════════════════════════════════════════════════════════════════════════
--
-- ONLY after the provider has been asked and has said the payout does not
-- exist. The wallet stays debited throughout — the hold is never released
-- here, only the claim, so the money cannot be spent twice while the row
-- waits for another attempt.

create function release_payout_claim(
  p_transaction_id uuid,
  p_provider_reference text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released uuid;
begin
  update transactions
  set provider = 'manual',
      status = 'pending',
      provider_reference = null,
      automated_payout_attempt_failed_reason = p_reason,
      automated_payout_retry_count = automated_payout_retry_count + 1
  where id = p_transaction_id
    and type = 'withdrawal'
    and status = 'processing'
    -- The guard that matters. Releasing someone else's reference would put a
    -- live payout back in the queue to be sent again.
    and provider_reference = p_provider_reference
  returning id into v_released;

  return v_released is not null;
end;
$$;

revoke execute on function release_payout_claim(uuid, text, text)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. THE BALANCE HOLD
-- ════════════════════════════════════════════════════════════════════════════
--
-- The retry counter is deliberately untouched. Returns true only the first
-- time, which is the whole of the "email admins once per withdrawal" rule.

create function record_payout_balance_hold(p_transaction_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prior timestamptz;
  v_found boolean;
begin
  select payout_balance_alert_sent_at, true
  into v_prior, v_found
  from transactions
  where id = p_transaction_id and type = 'withdrawal' and status = 'pending'
  for update;

  if not coalesce(v_found, false) then
    return false;
  end if;

  update transactions
  set needs_manual_review = true,
      manual_review_reason = p_reason,
      -- Set so the retry cron keeps picking the row up. The counter beside it
      -- stays where it is.
      automated_payout_attempt_failed_reason = p_reason,
      payout_balance_alert_sent_at = coalesce(payout_balance_alert_sent_at, now())
  where id = p_transaction_id;

  return v_prior is null;
end;
$$;

revoke execute on function record_payout_balance_hold(uuid, text)
  from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. INVARIANTS
-- ════════════════════════════════════════════════════════════════════════════
--
-- A separate function again, for the reason 0040 gives: appending to
-- assert_phase1_invariants means rewriting 250 lines of checks accumulated
-- since 0014, and a check that stops running is worse than one that never
-- existed.

create function assert_korapay_payout_invariants()
returns boolean
language plpgsql
as $$
declare
  v_name text;
  v_count integer;
begin
  -- The index the whole no-double-payment argument rests on.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'transactions_provider_reference_unique'
  ) then
    raise exception 'PAYOUT REGRESSION (0041): the unique index on transactions(provider, provider_reference) is gone.';
  end if;

  foreach v_name in array array[
    'claim_payout_attempt', 'release_payout_claim', 'record_payout_balance_hold'
  ]
  loop
    select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;
    if v_count = 0 then
      raise exception 'PAYOUT REGRESSION (0041): % has gone missing', v_name;
    end if;

    select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name
      and (
        has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
      );
    if v_count > 0 then
      raise exception 'PAYOUT REGRESSION (0041): % is executable by a user session', v_name;
    end if;
  end loop;

  return true;
end;
$$;

revoke execute on function assert_korapay_payout_invariants() from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. A CLEAN APPLY IS THE VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════
--
-- Same situation as 0033, 0037, 0038 and 0040: no Docker and no psql here, so
-- `supabase db push` is the only database this can run against. These are the
-- assertions a pgTAP file would make, written to leave nothing behind.

do $$
begin
  perform assert_phase1_invariants();
  perform assert_phase3_invariants();
  perform assert_phase4_invariants();
  perform assert_korapay_invariants();
  perform assert_korapay_payout_invariants();
  raise notice 'Invariants hold, with the payout claim included.';
end;
$$;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_tx uuid;
  v_claimed boolean;
  v_first boolean;
  v_row transactions;
begin
  insert into auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
  values (v_user, 'g3-payout@example.invalid', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', '', now(), now());

  insert into profiles (id, email, kyc_status, country)
  values (v_user, 'g3-payout@example.invalid', 'approved', 'NG')
  on conflict (id) do update set kyc_status = 'approved';

  insert into wallets (user_id, currency, balance)
  values (v_user, 'NGN', 0)
  on conflict (user_id, currency) do update set balance = 0;

  insert into transactions (user_id, type, provider, status, amount, currency)
  values (v_user, 'withdrawal', 'manual', 'pending', 2500, 'NGN')
  returning id into v_tx;

  -- ── 1. A balance hold does not burn a retry, and emails once ───────────
  v_first := record_payout_balance_hold(v_tx, 'Not enough NGN in the payout balance');
  if not v_first then
    raise exception 'ASSERTION FAILED: the first balance hold did not report itself as first.';
  end if;

  select * into v_row from transactions where id = v_tx;
  if v_row.automated_payout_retry_count <> 0 then
    raise exception 'ASSERTION FAILED: a balance hold incremented the retry counter to %', v_row.automated_payout_retry_count;
  end if;
  if not v_row.needs_manual_review then
    raise exception 'ASSERTION FAILED: a balance hold did not mark the row for review.';
  end if;

  v_first := record_payout_balance_hold(v_tx, 'Not enough NGN in the payout balance');
  if v_first then
    raise exception 'ASSERTION FAILED: a second hold claimed to be the first — admins would be emailed twice.';
  end if;

  -- ── 2. The claim succeeds exactly once ─────────────────────────────────
  -- THE most important behaviour in this file: the second caller must get
  -- false and therefore never call the payout API.
  v_claimed := claim_payout_attempt(v_tx, 'korapay', v_tx::text);
  if not v_claimed then
    raise exception 'ASSERTION FAILED: the first claim was refused.';
  end if;

  select * into v_row from transactions where id = v_tx;
  if v_row.status <> 'processing' or v_row.provider <> 'korapay'
     or v_row.provider_reference <> v_tx::text then
    raise exception 'ASSERTION FAILED: the claim did not stamp the row (status %, provider %)', v_row.status, v_row.provider;
  end if;
  if v_row.needs_manual_review then
    raise exception 'ASSERTION FAILED: the claim left the balance hold in place.';
  end if;

  v_claimed := claim_payout_attempt(v_tx, 'korapay', v_tx::text);
  if v_claimed then
    raise exception 'ASSERTION FAILED: a second claim succeeded. This is a double payout.';
  end if;

  -- ── 3. A release needs the right reference ─────────────────────────────
  if release_payout_claim(v_tx, 'somebody-elses-reference', 'nope') then
    raise exception 'ASSERTION FAILED: a claim was released with the wrong reference.';
  end if;

  if not release_payout_claim(v_tx, v_tx::text, 'Provider confirmed it never happened') then
    raise exception 'ASSERTION FAILED: the correct reference could not release the claim.';
  end if;

  select * into v_row from transactions where id = v_tx;
  if v_row.status <> 'pending' or v_row.provider <> 'manual' or v_row.provider_reference is not null then
    raise exception 'ASSERTION FAILED: the release did not return the row to the queue.';
  end if;
  if v_row.automated_payout_retry_count <> 1 then
    raise exception 'ASSERTION FAILED: a release must burn a retry; the counter is %', v_row.automated_payout_retry_count;
  end if;

  raise notice 'Payout claim behavioural checks pass.';

  delete from transactions where user_id = v_user;
  delete from wallets where user_id = v_user;
  delete from profiles where id = v_user;
  delete from auth.users where id = v_user;
end;
$$;

-- ============================================================================
-- justpae 0012 — the PIN stops being guessable.
--
-- WHAT WAS WRONG
--
-- Three separate problems, which compound into one:
--
-- 1. THE PIN HASH WAS SELECTABLE. 0003 created
--
--      create policy "withdrawal_pins: read own"
--        on withdrawal_pins for select using (auth.uid() = user_id);
--
--    with the comment "the app never selects pin_hash back to a client". The
--    app doesn't. The policy allows it anyway, and the client controls the
--    column list: `select('pin_hash')` from the user's own session returned the
--    bcrypt hash. An offline attack on a 4-digit bcrypt hash is ten thousand
--    candidates — seconds on a laptop, with no rate limit to hit because the
--    guessing happens off our infrastructure entirely. Every money-out action
--    in the product is gated on that PIN.
--
--    The policy existed so Settings could render "set up a PIN" vs "PIN is
--    set". That is a boolean, so it is now a function returning a boolean.
--
-- 2. UNLIMITED ONLINE GUESSES. verify_transaction_pin raised on a wrong PIN and
--    did nothing else — no counter, no lockout. 10,000 RPC calls against
--    create_withdrawal_request walks a 4-digit PIN in minutes.
--
-- 3. 4-DIGIT PINS, INCLUDING 0000 AND 1234. The format check was
--    `^[0-9]{4,6}$`, so the overwhelmingly likely user choice — four digits,
--    often a birth year or 1234 — was permitted.
--
-- THE FIX
--   a. Drop the select policy; add has_transaction_pin().
--   b. failed_attempts + locked_until, maintained inside
--      verify_transaction_pin: 5 failures locks for 30 minutes, success resets.
--      A locked account gets told when it can retry.
--   c. New PINs must be 6 digits and must not be trivial. Existing 4-digit
--      PINs keep verifying — breaking withdrawals for every current user to fix
--      a future-PIN problem would be its own outage — but the next change is
--      held to the new rule.
-- ============================================================================

-- ── a. The hash stops being readable ───────────────────────────────────────
drop policy "withdrawal_pins: read own" on withdrawal_pins;

-- RLS with no policies now denies everything through RLS, and the table grants
-- go too so a policy accidentally added later still cannot expose the column.
revoke all on table withdrawal_pins from public, anon, authenticated;

-- The boolean the select policy actually existed to answer. auth.uid(), so it
-- cannot be asked about anybody else.
create function has_transaction_pin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from withdrawal_pins where user_id = auth.uid());
$$;

grant execute on function has_transaction_pin() to authenticated;

-- ── b. Lockout state ───────────────────────────────────────────────────────
alter table withdrawal_pins
  add column failed_attempts integer not null default 0,
  add column locked_until timestamptz;

-- How many consecutive wrong PINs before the lock, and for how long. Named
-- constants in SQL are awkward, so they live in app_settings alongside the
-- other operator-tunable numbers — but with hard defaults, because a missing
-- row must never mean "no lockout".
insert into app_settings (key, value, description) values
  ('pin_max_failed_attempts', '5', 'Consecutive wrong transaction PINs before the PIN locks.'),
  ('pin_lock_minutes', '30', 'How long a transaction PIN stays locked after too many wrong attempts.')
on conflict (key) do nothing;

-- ── The shared PIN format validator ────────────────────────────────────────
-- One place, called by set_withdrawal_pin and change_withdrawal_pin_for_user.
-- Raises rather than returning false so no caller can forget to check.
--
-- Rejected, beyond the 6-digit shape:
--   all one digit          000000, 111111 …
--   ascending runs         123456, 234567 …
--   descending runs        654321, 098765 …
--   repeated short cycles  121212, 123123, 112112 …
-- Between them these cover the great majority of what people actually type
-- when asked for six digits in a hurry.
create function assert_pin_acceptable(p_pin text)
returns void
language plpgsql
immutable
as $$
declare
  v_ascending text := '0123456789';
  v_descending text := '9876543210';
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'Your PIN must be exactly 6 digits.';
  end if;

  if p_pin ~ '^(.)\1{5}$' then
    raise exception 'That PIN is too easy to guess. Avoid repeating the same digit.';
  end if;

  if position(p_pin in v_ascending) > 0 or position(p_pin in v_descending) > 0 then
    raise exception 'That PIN is too easy to guess. Avoid sequential digits.';
  end if;

  -- 010101 / 121212 (2-digit cycle) and 123123 / 456456 (3-digit cycle).
  if p_pin ~ '^(..)\1{2}$' or p_pin ~ '^(...)\1$' then
    raise exception 'That PIN is too easy to guess. Avoid repeating patterns.';
  end if;
end;
$$;

grant execute on function assert_pin_acceptable(text) to authenticated;

-- ── verify_transaction_pin — now checks the lock and resets on success ─────
-- This function checks the lock, checks the hash, clears the counter on
-- success, and RAISES on failure. It deliberately does NOT increment the
-- counter itself.
--
-- WHY THE INCREMENT LIVES ELSEWHERE: this runs inside the money function's
-- transaction (create_withdrawal_request, create_conversion_from_quote,
-- create_bill_payment_for_user). Raising is what makes those abort and refuse —
-- but the abort rolls back EVERY write in the transaction, an increment to
-- failed_attempts included. A counter bumped here would always roll straight
-- back to zero and the lockout would never trigger. Postgres has no autonomous
-- transaction to escape with.
--
-- So the increment is a separate call, in a separate transaction, made by the
-- TS layer immediately after it catches the raise: record_pin_failure below.
-- See src/lib/pin.ts, which is the only thing that calls it and the single
-- place every money action funnels its PIN errors through.
--
-- Distinct SQLSTATEs are used so the caller can tell the two failure modes
-- apart without string-matching the message:
--   JP001  wrong PIN   → count it, maybe lock, maybe email
--   JP002  locked      → do not count it; it is already locked
--
-- Custom codes rather than the default: a bare `raise exception` yields P0001
-- for EVERY raise in these functions, so 'Insufficient balance' and 'Incorrect
-- transaction PIN' would be indistinguishable to the TS layer and a failed
-- balance check would increment the PIN counter. The JP prefix is in the range
-- Postgres reserves for user-defined classes (first character I-Z), so it
-- cannot collide with a built-in condition name.
create or replace function verify_transaction_pin(p_user_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin_hash text;
  v_locked_until timestamptz;
  v_minutes integer;
begin
  select pin_hash, locked_until into v_pin_hash, v_locked_until
  from withdrawal_pins where user_id = p_user_id;

  if v_pin_hash is null then
    raise exception 'Set a transaction PIN in Settings first';
  end if;

  if v_locked_until is not null and v_locked_until > now() then
    v_minutes := greatest(1, ceil(extract(epoch from (v_locked_until - now())) / 60)::integer);
    raise exception 'Too many incorrect PIN attempts. Try again in % minute(s).', v_minutes
      using errcode = 'JP002';
  end if;

  if extensions.crypt(p_pin, v_pin_hash) <> v_pin_hash then
    raise exception 'Incorrect transaction PIN'
      using errcode = 'JP001';
  end if;

  -- Correct PIN: clear the history. Only written when there is something to
  -- clear, so the common path does no write at all.
  if v_locked_until is not null or exists (
    select 1 from withdrawal_pins where user_id = p_user_id and failed_attempts > 0
  ) then
    update withdrawal_pins
    set failed_attempts = 0, locked_until = null
    where user_id = p_user_id;
  end if;
end;
$$;

revoke execute on function verify_transaction_pin(uuid, text) from public, anon, authenticated;

-- ── record_pin_failure — the increment that survives the rollback ──────────
-- Called by the TS layer immediately after a money function raises 'Incorrect
-- transaction PIN'. That raise aborted the money function's transaction, so
-- this runs in a brand new one and its write commits.
--
-- Returns the resulting state so the caller knows whether THIS attempt caused
-- the lock, and therefore whether to send the lockout email — exactly once,
-- not on every subsequent attempt against an already-locked PIN.
-- The OUT column names are deliberately NOT failed_attempts / locked_until:
-- a RETURNS TABLE column shares the plpgsql namespace with table columns of
-- the same name, and `returning wp.failed_attempts into …` against a table
-- that has a column by that name is then an ambiguous reference and fails to
-- parse.
create function record_pin_failure(p_user_id uuid)
returns table (attempts_used integer, locked_until_at timestamptz, just_locked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
  v_minutes integer;
  v_attempts integer;
  v_locked timestamptz;
  v_was_locked boolean;
begin
  select coalesce(nullif(value, '')::integer, 5) into v_max
  from app_settings where key = 'pin_max_failed_attempts';
  v_max := greatest(coalesce(v_max, 5), 1);

  select coalesce(nullif(value, '')::integer, 30) into v_minutes
  from app_settings where key = 'pin_lock_minutes';
  v_minutes := greatest(coalesce(v_minutes, 30), 1);

  select (wp.locked_until is not null and wp.locked_until > now())
  into v_was_locked
  from withdrawal_pins wp where wp.user_id = p_user_id
  for update;

  if v_was_locked is null then
    -- No PIN row at all. Nothing to count; report a clean slate rather than
    -- inventing a lockout for an account that has no PIN.
    return query select 0, null::timestamptz, false;
    return;
  end if;

  update withdrawal_pins wp
  set failed_attempts = wp.failed_attempts + 1,
      locked_until = case
        when wp.failed_attempts + 1 >= v_max then now() + make_interval(mins => v_minutes)
        else wp.locked_until
      end
  where wp.user_id = p_user_id
  returning wp.failed_attempts, wp.locked_until into v_attempts, v_locked;

  return query select
    v_attempts,
    v_locked,
    (not coalesce(v_was_locked, false)) and v_locked is not null and v_locked > now();
end;
$$;

revoke execute on function record_pin_failure(uuid) from public, anon, authenticated;

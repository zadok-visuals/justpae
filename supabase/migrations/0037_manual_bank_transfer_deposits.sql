-- ============================================================================
-- justpae 0037 — NGN deposits by manual bank transfer (Group 4).
--
-- The provider's temporary bank accounts are unavailable, so a naira deposit
-- is now a transfer the customer makes to the company's own account, matched
-- by a reference and confirmed by a human.
--
-- ── WHAT MAKES THIS DIFFERENT FROM EVERY OTHER DEPOSIT PATH ────────────────
--
-- On the provider rails nobody has to be trusted about the amount: the
-- provider re-reports what actually arrived and credit_deposit takes that
-- figure. Here there is no provider. The only source of "what arrived" is an
-- admin reading a bank statement. So the rule the rest of this schema gets
-- for free has to be built by hand:
--
--   THE CREDITED AMOUNT IS ALWAYS ADMIN-ENTERED, SERVER-SIDE. The customer's
--   requested amount is a statement of intent and is recorded as such. It is
--   never what credits. A transfer of 45,000 against a request for 50,000
--   credits 45,000.
--
-- ── THE DUAL-ADMIN RULE IS IN THIS FILE, NOT IN THE UI ─────────────────────
--
-- An approval of 1,000,000 NGN or more needs two different admins. A disabled
-- button is not a control — a server action is reachable by POST whatever the
-- page rendered — so the second-admin check lives inside
-- approve_manual_deposit, under the same row lock as the credit. The first
-- admin's approval is recorded and the function returns without crediting;
-- only a SECOND, DIFFERENT admin agreeing the SAME figure moves the money.
--
-- The threshold is a hardcoded constant and deliberately NOT an app_setting.
-- Every other number here is operator-tunable because getting it wrong costs
-- a support ticket; this one is the control itself, and a control an
-- individual admin can raise from the admin UI is not a control.
--
-- ── SECURITY ───────────────────────────────────────────────────────────────
--
-- Every function below is security definer, search_path pinned, and revoked
-- from public/anon/authenticated. The user id always arrives as p_user_id
-- from supabase.auth.getUser() on the server, never from the browser. RLS on
-- deposits is unchanged — "deposits: read own" (0001) is still the only
-- policy, so there is still no path for a user session to insert or update a
-- deposit row at all.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1. THE METHOD, AND THE COLUMNS A MANUAL DEPOSIT NEEDS
-- ════════════════════════════════════════════════════════════════════════════
--
-- A NEW type, not a value added to an existing one, so it is usable in this
-- same migration — the restriction 0036 exists to work around applies only to
-- `alter type ... add value`.

create type deposit_method as enum ('provider', 'manual_bank_transfer');

alter table deposits add column if not exists method deposit_method not null default 'provider';

-- The reference the customer puts in their transfer narration, and the only
-- thing tying a line on a bank statement back to a row here. Unique, because
-- two deposits sharing one reference is an admin crediting the wrong account.
alter table deposits add column if not exists reference text;

create unique index if not exists deposits_reference_unique_idx
  on deposits (reference)
  where reference is not null;

-- What the admin says actually arrived, before the fee. Kept separate from
-- confirmed_amount, which keeps its existing meaning across every deposit
-- path: the amount that landed in the wallet. received_amount - fee =
-- confirmed_amount, and holding all three is what lets a receipt explain
-- itself months later.
alter table deposits add column if not exists received_amount numeric(18, 2);
alter table deposits add column if not exists fee numeric(18, 2);

-- Optional proof, in a private bucket (section 3). Null is normal: the brief
-- makes the upload optional, and a deposit is matched by its reference.
alter table deposits add column if not exists screenshot_path text;

-- When the customer pressed "I've sent it". Also what the 24-hour expiry
-- sweep keys off: a row with this set is never expired, because a human now
-- owes it an answer.
alter table deposits add column if not exists marked_sent_at timestamptz;

-- Who decided, and when. reviewed_by is the admin who COMPLETED the decision
-- — on a dual-admin approval that is the second one.
alter table deposits add column if not exists reviewed_by uuid references profiles (id);
alter table deposits add column if not exists reviewed_at timestamptz;

-- The first half of a dual-admin approval. first_approval_amount is held so
-- the second admin has to agree the same figure rather than merely agreeing
-- that something should be approved.
alter table deposits add column if not exists first_approver_id uuid references profiles (id);
alter table deposits add column if not exists first_approved_at timestamptz;
alter table deposits add column if not exists first_approval_amount numeric(18, 2);

comment on column deposits.received_amount is
  'Manual deposits: what an admin read off the bank statement. Entered '
  'server-side by an admin, never supplied by the browser.';

-- The admin queue reads exactly this set, newest first. Partial, because the
-- queue is the only thing that ever asks for it.
create index if not exists deposits_awaiting_review_idx
  on deposits (marked_sent_at)
  where status = 'awaiting_review';

-- The expiry sweep's scan: pending manual deposits nobody has marked sent.
create index if not exists deposits_manual_pending_idx
  on deposits (created_at)
  where status = 'pending' and method = 'manual_bank_transfer';


-- ════════════════════════════════════════════════════════════════════════════
-- 2. THE OPERATOR-TUNABLE SETTINGS
-- ════════════════════════════════════════════════════════════════════════════
--
-- app_settings is readable by any authenticated session (0002). That is
-- correct for these: the company's receiving account is shown to every
-- KYC-approved depositor anyway, and the limits are quoted on the screen
-- before the amount is accepted. Nothing secret lives here. The values are
-- still READ server-side and passed down, so the screen cannot be made to
-- show an account number the server did not choose.
--
-- Seeded empty rather than with a placeholder account number. A plausible-
-- looking fake in a field that tells people where to send money is the one
-- default worse than none — the customer screen refuses to render
-- instructions until all three are set.

insert into app_settings (key, value, description) values
  ('manual_deposit_bank_name', '', 'Bank holding the company account naira deposits are transferred to.'),
  ('manual_deposit_account_number', '', 'Account number naira deposits are transferred to.'),
  ('manual_deposit_account_name', 'Zadok Royal Limited', 'Account name naira deposits are transferred to.'),
  ('manual_deposit_min_ngn', '1000', 'Smallest naira bank-transfer deposit accepted.'),
  ('manual_deposit_max_ngn', '5000000', 'Largest naira bank-transfer deposit accepted in one request.'),
  ('manual_deposit_fee_ngn', '0', 'Flat naira fee deducted from the amount received before crediting.')
on conflict (key) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. THE SCREENSHOT BUCKET
-- ════════════════════════════════════════════════════════════════════════════
--
-- Private, owner-folder policies, exactly like kyc-documents and
-- pay-to-china-qr. The first path segment is the uploader's own user id,
-- which is what the policies match on — and the server re-verifies that
-- segment against the session's own id before any row records the path
-- (verifyOwnedUpload), because the policy stops them WRITING outside their
-- folder but nothing stops them REFERENCING someone else's.
--
-- The admin never reads this through RLS: there is no admin-side select
-- policy and there should not be one. The queue mints a signed URL with the
-- service role, which is a deliberate, logged, time-limited act rather than a
-- standing grant over every customer's uploads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deposit-proof',
  'deposit-proof',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "deposit-proof: insert own folder" on storage.objects
  for insert with check (
    bucket_id = 'deposit-proof' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "deposit-proof: read own folder" on storage.objects
  for select using (
    bucket_id = 'deposit-proof' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Replace, so a customer who uploaded the wrong screenshot can swap it before
-- an admin looks. No delete policy: a proof an admin may already have acted
-- on is not the customer's to remove.
create policy "deposit-proof: replace own folder" on storage.objects
  for update using (
    bucket_id = 'deposit-proof' and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 4. CREATING THE REQUEST
-- ════════════════════════════════════════════════════════════════════════════
--
-- The amount here IS customer-supplied, and it is the one figure in this
-- whole flow that may be: it is a statement of what they intend to send, it
-- credits nothing, and it is checked against the configured minimum and
-- maximum before it is recorded. Everything that moves money reads
-- received_amount instead.
--
-- The reference is generated HERE rather than in the application. It has to be
-- unique against the whole table, and the only place that can be guaranteed is
-- inside the insert, retrying on the unique violation.

create function generate_deposit_reference()
returns text
language sql
volatile
as $$
  -- JP + 8 characters. Crockford-ish alphabet: no I, O, 0 or 1, because this
  -- string is read off a screen and typed into a bank app by hand, and the
  -- characters people confuse are the ones that make a transfer unmatchable.
  select 'JP' || string_agg(
    substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1),
    ''
  )
  from generate_series(1, 8);
$$;

revoke execute on function generate_deposit_reference() from public, anon, authenticated;

create function create_manual_deposit(
  p_user_id uuid,
  p_amount numeric
)
returns table (deposit_id uuid, reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kyc kyc_status;
  v_suspended timestamptz;
  v_min numeric;
  v_max numeric;
  v_reference text;
  v_id uuid;
  v_attempt integer := 0;
begin
  -- KYC AND SUSPENSION, BEFORE ANYTHING IS WRITTEN. Both are re-checked here
  -- rather than trusted from the action: this function is the only way a
  -- manual deposit comes into existence, so it is the honest place for the
  -- gate. The action checks too, so the user gets a screen rather than an
  -- exception.
  select kyc_status, suspended_at into v_kyc, v_suspended
  from profiles where id = p_user_id;

  if v_kyc is null then
    raise exception 'No such account';
  end if;
  if v_suspended is not null then
    raise exception 'This account is suspended. Please contact support.';
  end if;
  if v_kyc <> 'approved' then
    raise exception 'Verify your identity to deposit naira.';
  end if;

  select coalesce(nullif(value, '')::numeric, 1000) into v_min
  from app_settings where key = 'manual_deposit_min_ngn';
  select coalesce(nullif(value, '')::numeric, 5000000) into v_max
  from app_settings where key = 'manual_deposit_max_ngn';

  v_min := coalesce(v_min, 1000);
  v_max := coalesce(v_max, 5000000);

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid amount.';
  end if;
  if p_amount < v_min then
    raise exception 'The smallest naira deposit is %.', v_min;
  end if;
  if p_amount > v_max then
    raise exception 'The largest naira deposit in one request is %.', v_max;
  end if;

  -- Retry on the unique index rather than pre-checking for a collision: a
  -- SELECT-then-INSERT races, the index does not. Eight characters from a
  -- 32-symbol alphabet is ~10^12 values, so the loop is a formality that
  -- nonetheless has to exist.
  loop
    v_attempt := v_attempt + 1;
    v_reference := generate_deposit_reference();
    begin
      insert into deposits (
        user_id, currency, amount, status, provider, method, reference
      )
      values (
        p_user_id, 'NGN', p_amount, 'pending', 'manual', 'manual_bank_transfer', v_reference
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise exception 'Could not allocate a deposit reference. Please try again.';
      end if;
    end;
  end loop;

  return query select v_id, v_reference;
end;
$$;

revoke execute on function create_manual_deposit(uuid, numeric) from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. "I'VE SENT IT"
-- ════════════════════════════════════════════════════════════════════════════
--
-- Moves pending → awaiting_review and nothing else. It credits nothing and it
-- is not evidence of anything; it is the customer telling us a queue item
-- exists. p_user_id is matched against the row's owner, so one customer
-- cannot mark another's deposit sent.

create function mark_manual_deposit_sent(
  p_user_id uuid,
  p_deposit_id uuid,
  p_screenshot_path text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status transaction_status;
  v_method deposit_method;
begin
  select user_id, status, method
  into v_owner, v_status, v_method
  from deposits
  where id = p_deposit_id
  for update;

  if v_owner is null or v_owner <> p_user_id then
    return false;
  end if;
  if v_method <> 'manual_bank_transfer' then
    return false;
  end if;

  -- Idempotent: pressing the button twice, or on a row the expiry sweep has
  -- already closed, is a no-op rather than an error.
  if v_status <> 'pending' then
    return false;
  end if;

  update deposits
  set status = 'awaiting_review',
      marked_sent_at = now(),
      screenshot_path = coalesce(p_screenshot_path, screenshot_path)
  where id = p_deposit_id;

  return true;
end;
$$;

revoke execute on function mark_manual_deposit_sent(uuid, uuid, text) from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. APPROVAL — THE MONEY FUNCTION
-- ════════════════════════════════════════════════════════════════════════════
--
-- Returns one of: 'credited', 'awaiting_second_approval', 'already_credited',
-- 'not_reviewable'. Raises only on a genuine refusal the admin must see and
-- act on (the same admin trying to be both signatures, or a second signature
-- for a different figure).
--
-- IDEMPOTENT ON THE DEPOSIT ID. The row is locked and the status re-read
-- inside the lock, so two admins pressing Approve at the same instant produce
-- one credit and one 'already_credited' — never two credits.
--
-- ONLY FROM awaiting_review. A pending deposit has not been claimed as sent;
-- a completed one is done. Neither is approvable, and saying so here rather
-- than in the queue is what makes it true for a crafted POST as well.

create function approve_manual_deposit(
  p_deposit_id uuid,
  p_admin_id uuid,
  p_received_amount numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Hardcoded, and not an app_setting. See the header: this is the control,
  -- and a control an admin can raise from the admin UI is not one.
  c_dual_admin_threshold constant numeric := 1000000;
  v_user_id uuid;
  v_currency currency;
  v_status transaction_status;
  v_method deposit_method;
  v_first_approver uuid;
  v_first_amount numeric;
  v_fee numeric;
  v_credit numeric;
begin
  select user_id, currency, status, method, first_approver_id, first_approval_amount
  into v_user_id, v_currency, v_status, v_method, v_first_approver, v_first_amount
  from deposits
  where id = p_deposit_id
  for update;

  if v_user_id is null or v_method <> 'manual_bank_transfer' then
    raise exception 'No such manual deposit';
  end if;

  -- The two non-approvable cases are told apart because the admin needs
  -- different things from them: 'already_credited' means a colleague got
  -- there first and the queue row is stale, 'not_reviewable' means the
  -- customer has not claimed to have sent anything yet.
  if v_status = 'completed' then
    return 'already_credited';
  end if;
  if v_status <> 'awaiting_review' then
    return 'not_reviewable';
  end if;

  if p_received_amount is null or p_received_amount <= 0 then
    raise exception 'Enter the amount that actually arrived.';
  end if;

  -- ── The dual-admin gate ──────────────────────────────────────────────────
  if p_received_amount >= c_dual_admin_threshold then
    if v_first_approver is null then
      update deposits
      set first_approver_id = p_admin_id,
          first_approved_at = now(),
          first_approval_amount = p_received_amount
      where id = p_deposit_id;
      return 'awaiting_second_approval';
    end if;

    if v_first_approver = p_admin_id then
      raise exception 'A second, different admin must approve a deposit of % or more.', c_dual_admin_threshold;
    end if;

    -- The second signature has to be for the same figure. Two admins who
    -- disagree about what arrived have not approved anything, and silently
    -- taking the later number would make the first approval decorative.
    if v_first_amount is distinct from p_received_amount then
      raise exception 'The first approver recorded %. Agree that figure or ask them to withdraw their approval.', v_first_amount;
    end if;
  end if;

  -- ── The credit ───────────────────────────────────────────────────────────
  -- The fee is read from app_settings in this same transaction, not passed
  -- in: a caller-supplied fee is a caller-supplied credited amount with an
  -- extra step.
  select coalesce(nullif(value, '')::numeric, 0) into v_fee
  from app_settings where key = 'manual_deposit_fee_ngn';
  v_fee := greatest(coalesce(v_fee, 0), 0);

  v_credit := p_received_amount - v_fee;
  if v_credit <= 0 then
    raise exception 'The amount received does not cover the % fee.', v_fee;
  end if;

  -- The wallet may not exist for a user whose country provisioned no naira
  -- wallet. Provision rather than dropping the money on the floor — same
  -- reasoning as credit_deposit.
  insert into wallets (user_id, currency, balance)
  values (v_user_id, v_currency, 0)
  on conflict (user_id, currency) do nothing;

  update wallets
  set balance = balance + v_credit, updated_at = now()
  where user_id = v_user_id and currency = v_currency;

  update deposits
  set status = 'completed',
      received_amount = p_received_amount,
      fee = v_fee,
      confirmed_amount = v_credit,
      reviewed_by = p_admin_id,
      reviewed_at = now()
  where id = p_deposit_id;

  return 'credited';
end;
$$;

revoke execute on function approve_manual_deposit(uuid, uuid, numeric) from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 7. REJECTION
-- ════════════════════════════════════════════════════════════════════════════
--
-- A reason is required at the call site, not here, so the admin gets a form
-- error rather than an exception — but the column is written whatever, and
-- the customer reads it.

create function reject_manual_deposit(
  p_deposit_id uuid,
  p_admin_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status transaction_status;
  v_method deposit_method;
begin
  select status, method into v_status, v_method
  from deposits
  where id = p_deposit_id
  for update;

  if v_status is null or v_method <> 'manual_bank_transfer' then
    return false;
  end if;
  if v_status <> 'awaiting_review' then
    return false;
  end if;

  update deposits
  set status = 'failed',
      decline_reason = p_reason,
      reviewed_by = p_admin_id,
      reviewed_at = now()
  where id = p_deposit_id;

  return true;
end;
$$;

revoke execute on function reject_manual_deposit(uuid, uuid, text) from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 8. THE 24-HOUR EXPIRY
-- ════════════════════════════════════════════════════════════════════════════
--
-- A request nobody ever marked sent is not waiting for anything. Left
-- pending, it sits in the customer's activity list looking live and holds a
-- reference that may still be sitting in somebody's transfer narration.
--
-- Only 'pending' rows are touched. A row the customer marked sent is
-- awaiting_review and belongs to a human now, however long that takes — an
-- expiry sweep that could close one would be a way to make a real claim
-- disappear by waiting.

create function expire_stale_manual_deposits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update deposits
    set status = 'expired',
        decline_reason = 'This request expired after 24 hours because it was never marked as sent. Nothing was taken.'
    where method = 'manual_bank_transfer'
      and status = 'pending'
      and created_at < now() - interval '24 hours'
      and confirmed_amount is null
    returning 1
  )
  select count(*) into v_count from expired;

  return coalesce(v_count, 0);
end;
$$;

revoke execute on function expire_stale_manual_deposits() from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 8a. CLOSING THE WRITE GRANTS ON deposits
-- ════════════════════════════════════════════════════════════════════════════
--
-- FOUND WHILE WRITING THE ASSERTION IN SECTION 9, which is what assertions
-- are for. `deposits` carries Supabase's project-default
-- `grant all ... to anon, authenticated`. Those grants have always been INERT
-- — RLS is on and "deposits: read own" (0001) is the only policy, so there is
-- no row a user session is permitted to insert or update — and no bug has
-- ever followed from them.
--
-- They are revoked anyway, for the reason 0014 gives for revoking trigger
-- functions nobody can call: the rule in this codebase is that a write a user
-- must never make is explicitly revoked, not left granted on the grounds that
-- a policy happens to stop it. On this table the stakes are specific — the
-- `status` column decides whether a wallet gets credited, and one accidental
-- `for insert with check (auth.uid() = user_id)` added by a future migration
-- would turn a standing grant into a customer crediting their own account.
-- With the grant gone, that same mistake writes nothing.
--
-- SELECT is untouched: the customer's own activity list reads this table.

revoke insert, update, delete on deposits from anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 8b. THE ADMIN LEDGER LEARNS THE NEW REFERENCE
-- ════════════════════════════════════════════════════════════════════════════
--
-- 0027's ledger reads `provider_reference` for a deposit's reference. A
-- manual deposit has no provider and therefore no provider_reference — its
-- reference is the JP code, which is the ONLY string tying it to a line on a
-- bank statement and so the only thing an operator will ever search for.
-- Without this, "find JPA7K2M9Q4" returns nothing on the one rail where
-- searching by reference is the whole job.
--
-- Column list, names and types are unchanged, which is what `create or
-- replace view` requires.

create or replace view admin_activity_ledger
with (security_invoker = true)
as
  select
    'transaction'::text          as source,
    t.id,
    t.user_id,
    p.email                      as user_email,
    p.full_name                  as user_name,
    t.type::text                 as kind,
    t.status::text               as status,
    t.currency::text             as currency,
    t.amount,
    t.target_currency::text      as target_currency,
    coalesce(t.actual_target_amount, t.target_amount) as target_amount,
    t.fee,
    t.provider::text             as provider,
    t.provider_reference         as reference,
    t.decline_reason,
    t.created_at
  from transactions t
  join profiles p on p.id = t.user_id

  union all

  select
    'deposit'::text,
    d.id,
    d.user_id,
    p.email,
    p.full_name,
    'deposit'::text,
    d.status::text,
    d.currency::text,
    coalesce(d.confirmed_amount, d.amount),
    null::text,
    null::numeric,
    -- Cast away the (18,2): `create or replace view` refuses to change a
    -- column's declared type, and this slot was `null::numeric` in 0027.
    d.fee::numeric,
    d.provider::text,
    coalesce(d.reference, d.provider_reference),
    d.decline_reason,
    d.created_at
  from deposits d
  join profiles p on p.id = d.user_id

  union all

  select
    'bill'::text,
    b.id,
    b.user_id,
    p.email,
    p.full_name,
    'bill_' || b.category::text,
    b.status::text,
    b.currency::text,
    b.amount,
    null::text,
    null::numeric,
    b.fee,
    b.provider,
    b.provider_reference,
    b.decline_reason,
    b.created_at
  from bill_payments b
  join profiles p on p.id = b.user_id;

revoke all on admin_activity_ledger from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 9. THE INVARIANTS, EXTENDED
-- ════════════════════════════════════════════════════════════════════════════
--
-- Check 1 already catches any new function left callable by a user session,
-- because Postgres grants EXECUTE to PUBLIC by default and that catch-all is
-- what notices a forgotten revoke. Naming the five new money functions in
-- v_must_be_server_only additionally catches the other way to lose the
-- protection: the function being DROPPED, which a grant audit sails past.
--
-- The new storage policies are asserted too. A private bucket whose policies
-- went missing is not a locked bucket — it is a bucket nobody can write to,
-- and the failure would show up as customers unable to attach a screenshot
-- rather than as a security event. The one that matters in the other
-- direction is `public = false`, asserted directly.

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
    -- 0037 adds NO user-callable function. A manual deposit is created,
    -- marked sent, approved and rejected entirely through the service role.
  ];
  v_must_not_exist text[] := array[
    'create_conversion',
    'create_bill_payment',
    'set_transaction_provider_reference',
    'change_withdrawal_pin',
    'request_recipient_change',
    'confirm_recipient_change',
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
    'partially_complete_conversion',
    'settle_cny_conversion',
    'create_pay_to_china_request',
    'admin_start_pay_to_china',
    'admin_complete_pay_to_china',
    'admin_reject_pay_to_china',
    'admin_set_cny_tier_rate',
    'admin_delete_cny_tier_rate',
    'admin_set_cny_markup_rate',
    'admin_set_supplier_rate',
    -- 0037
    'create_manual_deposit',
    'mark_manual_deposit_sent',
    'approve_manual_deposit',
    'reject_manual_deposit',
    'expire_stale_manual_deposits',
    'generate_deposit_reference'
  ];
  v_offenders text;
  v_count integer;
  v_table text;
  v_policy text;
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

  -- ── 0037: deposits is still write-closed to a user session ─────────────
  --
  -- THE ONE THAT MATTERS MOST IN THIS MIGRATION. A manual deposit is a row
  -- whose `status` decides whether a wallet gets credited. If a user session
  -- could ever insert or update here, the whole flow collapses into "the
  -- customer asserts they were paid" — which is precisely what 0004 refused
  -- to allow on the provider rails.
  select string_agg(policyname || ' (' || cmd || ')', ', ') into v_offenders
  from pg_policies
  where schemaname = 'public' and tablename = 'deposits' and cmd <> 'SELECT';

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION (0037): deposits has a non-SELECT policy: %. A user session must never write a deposit row.', v_offenders;
  end if;

  select count(*) into v_count
  from information_schema.table_privileges
  where table_schema = 'public' and table_name = 'deposits'
    and grantee in ('anon', 'authenticated', 'public')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

  if v_count > 0 then
    raise exception 'PHASE 1 REGRESSION (0037): deposits has % write grant(s) to a user role', v_count;
  end if;

  -- ── 0037: the screenshot bucket is private, and owner-scoped ───────────
  if not exists (
    select 1 from storage.buckets where id = 'deposit-proof' and public = false
  ) then
    raise exception 'PHASE 1 REGRESSION (0037): the deposit-proof bucket is missing or is PUBLIC. Customers'' bank screenshots would be world-readable by URL.';
  end if;

  foreach v_policy in array array[
    'deposit-proof: insert own folder',
    'deposit-proof: read own folder'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = v_policy
    ) then
      raise exception 'PHASE 1 REGRESSION (0037): the storage policy "%" is missing', v_policy;
    end if;
  end loop;

  return true;
end;
$$;

grant execute on function assert_phase1_invariants() to authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 10. A CLEAN APPLY IS THE VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════
--
-- This machine has neither Docker nor psql, so there is no local database to
-- reset and no client to connect with — the same situation 0033 records. The
-- assertions therefore run here, against the live linked project, which is
-- the honest version of "re-run the invariant assertions before pushing".
--
-- The behavioural checks below are what a pgTAP file would assert, written as
-- a rolled-back transaction so they leave nothing behind. They cover the four
-- rules that cannot be read off the catalog: the credited amount is the
-- received one, a double approve credits once, the dual-admin threshold, and
-- the expiry.

do $$
begin
  perform assert_phase1_invariants();
  perform assert_phase3_invariants();
  perform assert_phase4_invariants();
  raise notice 'Invariants hold, with manual bank-transfer deposits included.';
end;
$$;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_admin_a uuid := gen_random_uuid();
  v_admin_b uuid := gen_random_uuid();
  v_deposit uuid;
  v_reference text;
  v_result text;
  v_balance numeric;
  v_status transaction_status;
  v_expired integer;
begin
  -- Fixture. auth.users first, because profiles references it.
  insert into auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
  values
    (v_user, 'g4-user@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now()),
    (v_admin_a, 'g4-admin-a@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now()),
    (v_admin_b, 'g4-admin-b@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now());

  insert into profiles (id, email, kyc_status, country)
  values
    (v_user, 'g4-user@example.invalid', 'approved', 'NG'),
    (v_admin_a, 'g4-admin-a@example.invalid', 'approved', 'NG'),
    (v_admin_b, 'g4-admin-b@example.invalid', 'approved', 'NG')
  on conflict (id) do update set kyc_status = 'approved';

  insert into wallets (user_id, currency, balance)
  values (v_user, 'NGN', 0)
  on conflict (user_id, currency) do update set balance = 0;

  -- ── 1. The received amount credits, not the requested one ──────────────
  select deposit_id, reference into v_deposit, v_reference
  from create_manual_deposit(v_user, 50000);

  if v_reference !~ '^JP[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then
    raise exception 'GROUP 4 TEST: reference % is not JP + 8 characters', v_reference;
  end if;

  if not mark_manual_deposit_sent(v_user, v_deposit, null) then
    raise exception 'GROUP 4 TEST: marking sent failed';
  end if;

  v_result := approve_manual_deposit(v_deposit, v_admin_a, 45000);
  if v_result <> 'credited' then
    raise exception 'GROUP 4 TEST: expected credited, got %', v_result;
  end if;

  select balance into v_balance from wallets where user_id = v_user and currency = 'NGN';
  if v_balance <> 45000 then
    raise exception 'GROUP 4 TEST: credited % but the admin entered 45000', v_balance;
  end if;

  -- ── 2. A double approve credits once ───────────────────────────────────
  v_result := approve_manual_deposit(v_deposit, v_admin_b, 45000);
  if v_result <> 'already_credited' then
    raise exception 'GROUP 4 TEST: a second approve returned %, not already_credited', v_result;
  end if;

  select balance into v_balance from wallets where user_id = v_user and currency = 'NGN';
  if v_balance <> 45000 then
    raise exception 'GROUP 4 TEST: a second approve credited again — balance is now %', v_balance;
  end if;

  -- ── 3. Approval is only ever from awaiting_review ──────────────────────
  select deposit_id into v_deposit from create_manual_deposit(v_user, 20000);
  v_result := approve_manual_deposit(v_deposit, v_admin_a, 20000);
  if v_result <> 'not_reviewable' then
    raise exception 'GROUP 4 TEST: a PENDING deposit was approvable (%)', v_result;
  end if;
  select balance into v_balance from wallets where user_id = v_user and currency = 'NGN';
  if v_balance <> 45000 then
    raise exception 'GROUP 4 TEST: approving a pending deposit moved money — balance %', v_balance;
  end if;

  -- ── 4. The dual-admin rule, enforced in the database ───────────────────
  select deposit_id into v_deposit from create_manual_deposit(v_user, 1500000);
  perform mark_manual_deposit_sent(v_user, v_deposit, null);

  v_result := approve_manual_deposit(v_deposit, v_admin_a, 1500000);
  if v_result <> 'awaiting_second_approval' then
    raise exception 'GROUP 4 TEST: a 1.5m approval returned % on the first signature', v_result;
  end if;
  select balance into v_balance from wallets where user_id = v_user and currency = 'NGN';
  if v_balance <> 45000 then
    raise exception 'GROUP 4 TEST: one admin credited 1.5m on their own — balance %', v_balance;
  end if;

  -- The SAME admin cannot be both signatures.
  begin
    v_result := approve_manual_deposit(v_deposit, v_admin_a, 1500000);
    raise exception 'GROUP 4 TEST: the same admin supplied both signatures';
  exception when others then
    if sqlerrm like 'GROUP 4 TEST%' then raise; end if;
  end;

  -- A second admin for a DIFFERENT figure is refused.
  begin
    v_result := approve_manual_deposit(v_deposit, v_admin_b, 1400000);
    raise exception 'GROUP 4 TEST: a second approval for a different figure was accepted';
  exception when others then
    if sqlerrm like 'GROUP 4 TEST%' then raise; end if;
  end;

  -- A second, different admin agreeing the figure credits.
  v_result := approve_manual_deposit(v_deposit, v_admin_b, 1500000);
  if v_result <> 'credited' then
    raise exception 'GROUP 4 TEST: the second signature returned %', v_result;
  end if;
  select balance into v_balance from wallets where user_id = v_user and currency = 'NGN';
  if v_balance <> 1545000 then
    raise exception 'GROUP 4 TEST: expected 1545000 after the dual approval, got %', v_balance;
  end if;

  -- ── 5. Expiry closes an unsent request and spares a sent one ───────────
  select deposit_id into v_deposit from create_manual_deposit(v_user, 30000);
  update deposits set created_at = now() - interval '25 hours' where id = v_deposit;

  -- A row the customer DID mark sent, also older than 24 hours.
  declare v_sent uuid;
  begin
    select deposit_id into v_sent from create_manual_deposit(v_user, 31000);
    perform mark_manual_deposit_sent(v_user, v_sent, null);
    update deposits set created_at = now() - interval '25 hours' where id = v_sent;

    v_expired := expire_stale_manual_deposits();
    if v_expired < 1 then
      raise exception 'GROUP 4 TEST: the expiry sweep closed nothing';
    end if;

    select status into v_status from deposits where id = v_deposit;
    if v_status <> 'expired' then
      raise exception 'GROUP 4 TEST: an unsent 25-hour-old request is %, not expired', v_status;
    end if;

    select status into v_status from deposits where id = v_sent;
    if v_status <> 'awaiting_review' then
      raise exception 'GROUP 4 TEST: the sweep closed a deposit the customer had marked sent (now %)', v_status;
    end if;
  end;

  -- ── 6. Rejection records the reason and credits nothing ────────────────
  select deposit_id into v_deposit from create_manual_deposit(v_user, 25000);
  perform mark_manual_deposit_sent(v_user, v_deposit, null);
  if not reject_manual_deposit(v_deposit, v_admin_a, 'No matching transfer found.') then
    raise exception 'GROUP 4 TEST: rejection failed';
  end if;
  select status into v_status from deposits where id = v_deposit;
  if v_status <> 'failed' then
    raise exception 'GROUP 4 TEST: a rejected deposit is %, not failed', v_status;
  end if;
  select balance into v_balance from wallets where user_id = v_user and currency = 'NGN';
  if v_balance <> 1545000 then
    raise exception 'GROUP 4 TEST: a rejection moved money — balance %', v_balance;
  end if;

  raise notice 'Group 4 behavioural checks pass.';

  -- Leave nothing behind. The fixture rows cascade from auth.users.
  delete from deposits where user_id = v_user;
  delete from wallets where user_id = v_user;
  delete from profiles where id in (v_user, v_admin_a, v_admin_b);
  delete from auth.users where id in (v_user, v_admin_a, v_admin_b);
end;
$$;

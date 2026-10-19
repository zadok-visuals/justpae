-- ============================================================================
-- justpae 0030 — deposit pay-in expiry (Group 4b).
--
-- Two things: remember when a deposit's transfer details die, and give the
-- reconciler a way to say so.
--
-- ── WHY THE EXPIRY HAS TO BE PERSISTED ─────────────────────────────────────
--
-- The provider returns `pay_in.expires_at` when the transfer is created, and
-- until now that value existed ONLY in the browser's component state on the
-- screen that created it. Close the tab and the deadline is gone: the server
-- has no idea whether a pending deposit is one minute old or three days past
-- the point where its account number stopped working.
--
-- The practical consequence is the bug this migration exists to fix. A
-- deposit whose window closed with nothing received stays 'pending' forever.
-- The customer's activity list shows it as in-flight, the detail sheet shows
-- a timeline whose current step is "Funds received" — a step that will never
-- happen — and the only honest instruction, "those details are dead, start
-- again", is nowhere on the screen.
--
-- ── WHY expire_deposit IS NOT JUST fail_deposit WITH A DIFFERENT STRING ────
--
-- Because the two mean different things to the person reading them. A failed
-- deposit is "something went wrong with your money". An expired one is
-- "nothing happened at all, and nothing was taken" — and the difference
-- decides whether the customer opens a support thread. 0029 adds the status
-- value for exactly this reason.
--
-- ── SECURITY ───────────────────────────────────────────────────────────────
--
-- security definer, search_path pinned, and REVOKED from public/anon/
-- authenticated like every other money function in this schema. Only the
-- service role reaches it, and only from the reconcile cron. A client being
-- able to expire its own deposit would be a way to make a pending credit
-- disappear from the queue the moment before it lands.
-- ============================================================================

-- ── The deadline ────────────────────────────────────────────────────────────
-- Nullable, because it genuinely is unknown for rows created before this
-- migration and for any provider that returns no expiry. A null here means
-- "no deadline we know of", and expire_deposit below refuses to act on one
-- rather than guessing a default — inventing an expiry for a deposit whose
-- details might still be live is the one mistake worse than leaving it
-- pending.
alter table deposits add column if not exists pay_in_expires_at timestamptz;

comment on column deposits.pay_in_expires_at is
  'When the provider''s transfer details stop accepting money. Null when the '
  'provider returned no expiry. Written at creation; read by the reconciler '
  'and by the deposit screen.';

-- The reconciler scans for pending deposits whose deadline has passed. Without
-- this, that scan is a sequential scan of every deposit ever made, every run.
-- Partial, because the only rows it ever looks at are the pending ones.
create index if not exists deposits_pending_expiry_idx
  on deposits (pay_in_expires_at)
  where status = 'pending';

-- ── The transition ──────────────────────────────────────────────────────────
create function expire_deposit(p_deposit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status transaction_status;
  v_expires_at timestamptz;
  v_confirmed numeric;
begin
  select status, pay_in_expires_at, confirmed_amount
  into v_status, v_expires_at, v_confirmed
  from deposits
  where id = p_deposit_id
  for update;

  -- Not ours to touch. Idempotent rather than raising, like credit_deposit
  -- and fail_deposit: the webhook, the user-facing poll and the cron all race
  -- each other by design, and a second caller must be a no-op, not an error.
  if v_status is null or v_status <> 'pending' then
    return false;
  end if;

  -- No known deadline: leave it alone. See the note on the column above.
  if v_expires_at is null then
    return false;
  end if;

  -- The deadline has not passed yet.
  if v_expires_at > now() then
    return false;
  end if;

  -- MONEY ARRIVED. This is the race that matters: a transfer can land in the
  -- final seconds and be confirmed by the webhook while this function is
  -- being called. Expiring a deposit that has a confirmed amount would hide
  -- a real credit behind a dead-end screen. The row lock above serialises us
  -- against credit_deposit; this check is what makes that lock useful.
  if v_confirmed is not null then
    return false;
  end if;

  update deposits
  set status = 'expired',
      decline_reason = 'The transfer details expired before any money arrived. Nothing was taken.'
  where id = p_deposit_id;

  return true;
end;
$$;

revoke execute on function expire_deposit(uuid) from public, anon, authenticated;

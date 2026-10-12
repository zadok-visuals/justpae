-- ============================================================================
-- justpae 0018 — exactly-once claim for money-event notifications.
--
-- THE PROBLEM THIS SOLVES. Every terminal money state in this schema is
-- reachable from more than one place, on purpose:
--
--   a deposit is credited by the Busha webhook, by the Klasha webhook, and by
--   the reconcile-deposits cron;
--   a conversion completes in the convert action (synchronously, when the
--   provider already settled), in checkConversionStatus (the user-facing poll,
--   which self-heals because this provider's webhook has never once delivered
--   to this kind of endpoint for this account), in the webhook, and in the
--   reconciler;
--   a withdrawal completes in the webhook, in the reconciler, in the
--   automated-payout helper and in the admin queue.
--
-- That redundancy is deliberate and must stay: each path is the one that works
-- when another is down. The money functions are all idempotent, so a second
-- completion is a no-op — `complete_conversion` on an already-completed row
-- changes nothing.
--
-- A NOTIFICATION IS NOT IDEMPOTENT. Sending it four times sends it four times.
-- A customer who gets four "your deposit landed" emails for one deposit does
-- not conclude that our webhooks are redundant; they conclude they have been
-- credited four times, and the resulting support ticket is the exact opposite
-- of what the notification was for.
--
-- So the notification needs its own exactly-once gate, and it has to be in the
-- database rather than in the application: the four callers are four separate
-- processes (two webhook handlers, a cron, a server action), so no in-process
-- guard, cache or lock can see all of them. One conditional UPDATE does it —
-- `where notified_at is null` makes the claim atomic under Postgres's own row
-- locking, and whichever path gets there first is the one that notifies.
--
-- The column is on the row, not in a separate ledger, because the question it
-- answers is a property of that row ("has this event been announced") and a
-- join table would need its own cleanup when the row is deleted.
-- ============================================================================

-- Nullable with no default and no backfill: every row that exists right now
-- predates the notification system, and stamping them would be a lie, while
-- leaving them null would let the reconciler announce a month-old settled
-- deposit as news. Neither matters in practice — the reconcilers only look at
-- rows that are still pending — but null is the honest value for "we do not
-- know", and only a future terminal transition will set it.
alter table transactions add column notified_at timestamptz;
alter table deposits add column notified_at timestamptz;

comment on column transactions.notified_at is
  'When the user was told about this transaction reaching a terminal state. Set by claim_transaction_notification, which is the exactly-once gate across the several paths that can complete the same row.';
comment on column deposits.notified_at is
  'When the user was told this deposit was credited. See claim_deposit_notification.';

-- ── The claim ──────────────────────────────────────────────────────────────
-- Returns true to EXACTLY ONE caller and false to every other, forever.
--
-- `found` after an UPDATE is per-statement in plpgsql, so it reports whether
-- THIS statement matched a row — which is precisely the claim. Two concurrent
-- callers serialise on the row lock: the second one's `notified_at is null`
-- predicate is re-evaluated against the committed new value and matches
-- nothing.
--
-- Service role only, like every other function the webhooks and crons call. A
-- user session has no business claiming or releasing a notification: being
-- able to call this with false would let someone suppress the email that tells
-- the account holder their money moved, which is the single most useful thing
-- an attacker inside a session could switch off.
create function claim_transaction_notification(p_transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update transactions
  set notified_at = now()
  where id = p_transaction_id and notified_at is null;

  return found;
end;
$$;

revoke execute on function claim_transaction_notification(uuid)
  from public, anon, authenticated;

create function claim_deposit_notification(p_deposit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update deposits
  set notified_at = now()
  where id = p_deposit_id and notified_at is null;

  return found;
end;
$$;

revoke execute on function claim_deposit_notification(uuid)
  from public, anon, authenticated;

-- The standing assertion from Phase 1 is what catches a missing revoke above:
-- Postgres grants EXECUTE to PUBLIC on a new function by default, so "we never
-- granted it" is not the same as "they cannot call it", and these two are not
-- on the allowlist.
do $$
begin
  perform assert_phase1_invariants();
  perform assert_phase3_invariants();
  raise notice 'Phase 1 and Phase 3 invariants still hold after 0018.';
end;
$$;

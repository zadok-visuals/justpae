-- ============================================================================
-- justpae 0021 — make a redelivered webhook a no-op instead of a second row.
--
-- WHAT WAS WRONG
--
-- Both receivers insert into webhook_events unconditionally and then act. A
-- provider that redelivers — which every provider does, on a timeout, a slow
-- response, or an operator pressing "resend" in a dashboard — produced a
-- second row that looked exactly like a new event, and re-ran the handler.
--
-- Double-crediting was already prevented, and that is worth stating precisely
-- so this migration is not mistaken for a money fix: credit_deposit only acts
-- on a deposit still in 'pending', so the second attempt finds it 'completed'
-- and does nothing. The real costs were quieter — an events table that cannot
-- be used to answer "how many times did this actually happen", a second
-- pointless provider round trip, and a duplicate customer notification on any
-- future handler that is less careful than credit_deposit.
--
-- WHAT THIS ADDS
--
-- event_key: a per-delivery identity, computed by the receiver from the
-- provider's own fields, plus a unique index on (provider, event_key). A
-- redelivery then fails the insert with 23505, which the receiver reads as
-- "already seen" and returns 200 to — a duplicate must be acknowledged, not
-- retried into the provider's dead-letter queue.
--
-- WHY A PARTIAL INDEX, and why event_key is nullable: an unparseable body has
-- no key to compute, and a provider may send an event carrying nothing stable
-- to key on. Those rows still have to be recorded — an unparseable delivery is
-- exactly the thing you want a record of — so null is allowed and simply not
-- deduplicated. `where event_key is not null` keeps the index from treating
-- two unkeyed rows as a collision.
--
-- NOTHING HERE WEAKENS 0010-0019. One nullable column and one index on a table
-- no user session can read: webhook_events has RLS enabled with no select
-- policy, so it is service-role only and stays that way.
-- ============================================================================

alter table webhook_events
  add column event_key text;

comment on column webhook_events.event_key is
  'Per-delivery identity, computed by the receiver from the provider''s own fields. Null when the delivery carried nothing stable to key on (an unparseable body, say) — such rows are recorded but not deduplicated.';

-- The dedupe. Scoped per provider, because two providers' reference formats
-- are unrelated and a collision between them would be an accident.
create unique index webhook_events_provider_event_key_idx
  on webhook_events (provider, event_key)
  where event_key is not null;

-- Re-assert. The invariants exist to police exactly this kind of change, and a
-- migration that adds a column to a table in the money path should prove it
-- broke nothing rather than assume so.
do $$
begin
  perform assert_phase1_invariants();
  perform assert_phase3_invariants();
  perform assert_phase4_invariants();
  raise notice 'Phase 1, 3 and 4 invariants hold after 0021.';
end;
$$;

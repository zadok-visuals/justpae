-- ============================================================================
-- justpae 0039 — one new transaction_provider value, and nothing else.
--
-- Postgres forbids USING a newly added enum value in the same transaction that
-- added it, and `supabase db push` runs each file in its own transaction. 0040
-- both references 'korapay' and writes it, so the value has to land in an
-- earlier file. Same constraint 0023, 0029 and 0036 record for theirs.
--
-- WHAT IT IS FOR. Naira deposits move to permanent virtual account numbers
-- issued by a second provider, and naira and shilling payouts gain a second
-- route. Both write rows whose `provider` has to say which one actually
-- handled the money — "busha" on a row a different provider settled would
-- make every reconciliation after it wrong.
-- ============================================================================

alter type transaction_provider add value 'korapay';

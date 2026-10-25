-- ============================================================================
-- justpae 0036 — one new transaction_status value, and nothing else.
--
-- Postgres forbids USING a newly added enum value in the same transaction that
-- added it, and `supabase db push` runs each file in its own transaction. 0037
-- both references 'awaiting_review' and writes it, so the value has to land in
-- an earlier file. Same constraint 0023 and 0029 record for their values.
--
-- WHAT IT IS FOR (Group 4). A manual bank-transfer deposit has a state the
-- provider rails never had: the customer says they have sent the money and a
-- human has not yet confirmed it arrived. That is not 'pending' — pending
-- means we are waiting on the CUSTOMER, and the deposit screen and the
-- timeline both say so. It is not 'processing' either, which across this
-- schema means a provider has the money in hand. Nobody has anything yet
-- except a claim, and the queue that clears it is a person.
-- ============================================================================

alter type transaction_status add value 'awaiting_review';

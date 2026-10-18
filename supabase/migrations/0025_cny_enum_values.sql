-- ============================================================================
-- justpae 0025 — CNY, and the transaction type that spends it.
--
-- WHY THIS FILE CONTAINS TWO LINES AND NOTHING ELSE
--
-- Postgres will let you ADD a value to an enum inside a transaction, but it
-- will not let you USE that value in the same transaction — the new label is
-- not visible to the rest of the transaction that created it. `supabase db
-- push` runs each migration file in one transaction, so a single file that
-- adds 'CNY' and then writes `currency = 'CNY'` anywhere (a wallet backfill, a
-- check constraint, a default) fails with:
--
--   unsafe use of new value "CNY" of enum type currency
--
-- So the labels land here, alone, and 0026 — a separate transaction — does
-- everything that depends on them. This is the same split the reference
-- implementation's own 0002 had to make, for the same reason.
--
-- `if not exists` on both, so re-running this file against a database that
-- already has them is a no-op rather than an error.
--
-- WHAT THE TWO LABELS MEAN
--
--   CNY            a SYNTHETIC ledger wallet. No provider holds yuan for this
--                  business: a CNY balance is an internal obligation, created
--                  by converting into it and discharged by spending it through
--                  Pay to China or converting back out. It is deliberately NOT
--                  withdrawable, and 0026's own checks — not just the UI —
--                  are what enforce that.
--   pay_to_china   a manual, human-settled payout to an Alipay, WeChat or
--                  Chinese bank recipient. It is not a 'convert' and not a
--                  'withdrawal': both of those have automated provider paths
--                  and settlement rules that do not apply to a request a
--                  person fulfils by hand and photographs the receipt of.
-- ============================================================================

alter type currency add value if not exists 'CNY';

alter type transaction_type add value if not exists 'pay_to_china';

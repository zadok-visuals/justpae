-- ============================================================================
-- justpae 0032 — the indexes the hot read paths were missing, and a probe that
-- can prove it again later.
--
-- INDEXES ONLY. This migration creates and drops indexes, creates one
-- diagnostic function, and runs `analyze`. It does not touch a single grant,
-- policy, function body or column on any money path. Every security property
-- established by 0001–0031 is exactly as it was afterwards.
--
-- ──────────────────────────────────────────────────────────────────────────
-- THE HONEST PROBLEM WITH MEASURING THIS TODAY
--
-- Read this before reading any plan this migration prints, because without it
-- the plans will mislead you.
--
-- The linked project has not launched. At the time this was written, measured
-- from the live database rather than guessed:
--
--     transactions          0 rows      8 kB table      80 kB of indexes
--     deposits              3 rows     16 kB table     104 kB of indexes
--     bill_payments         0 rows      8 kB table      40 kB of indexes
--     support_messages      3 rows     16 kB table      48 kB of indexes
--     notifications         0 rows      8 kB table      24 kB of indexes
--     profiles              2 rows     48 kB table      40 kB of indexes
--
-- At those sizes the planner is RIGHT to sequential-scan everything. A table
-- that fits in one page costs one page read; no index can beat that, and
-- Postgres will keep choosing the seq scan after this migration exactly as it
-- did before. So:
--
--   * An EXPLAIN taken today cannot show an index "fixing" a plan, because
--     there is no plan to fix yet.
--   * An EXPLAIN taken today CAN show something else, which is what the probe
--     below is actually for: whether the query shape is *capable* of using an
--     index at all, and whether it has to SORT. A Sort node over a whole table
--     is the failure mode that does not announce itself at three rows and is
--     unfixable by hardware at three million.
--
-- So the probe prints each plan twice: once naturally, and once with
-- enable_seqscan off, which forces the planner to show which index it WOULD
-- reach for. The second form is the diagnostic. It is a standard technique for
-- exactly this situation — verifying an index matches a query shape
-- independently of the current row count — and it is labelled as such rather
-- than presented as a timing.
--
-- Every index below is therefore justified by a NAMED QUERY in this codebase
-- and by the shape of its plan, not by a stopwatch. The file says which query
-- and where. Nothing here was added because it seemed generally sensible.
--
-- ──────────────────────────────────────────────────────────────────────────
-- WHY THIS IS NOT JUST "ADD INDEXES"
--
-- Look at the figures above again: on five of those six tables the indexes
-- are already LARGER than the data. Every index is a write tax on the hottest
-- money tables in the product — transactions and deposits are inserted and
-- updated inside the service-role functions that move customer money, and
-- each extra index is more work inside those transactions.
--
-- So this migration also DROPS three indexes, and the reason is that they are
-- strict subsets of ones it creates. A btree on (created_at desc) answers
-- nothing that a btree on (created_at desc, id desc) does not answer the same
-- way; keeping both means paying twice on insert for one capability. Those
-- three drops are the only non-additive thing here, they are pure indexes,
-- and each is named with the index that replaces it.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1. THE PROBE
-- ════════════════════════════════════════════════════════════════════════════
--
-- A re-runnable EXPLAIN over every hot read path, kept rather than thrown
-- away, because the measurement that matters cannot be taken yet. When this
-- project has real volume, an operator runs
--
--     select * from explain_hot_query_plans();
--
-- in the SQL editor and gets the current plan for each named query, and the
-- same list is in front of them that was in front of whoever wrote this.
-- Writing it down in a document instead would have gone stale the first time
-- a page changed.
--
-- SECURITY, STATED EXPLICITLY, because this function runs dynamic SQL:
--
--   * It is NOT security definer. It runs with the caller's own rights, so it
--     can read exactly what the caller could already read. The service role
--     can read everything; a user session, which this is revoked from anyway,
--     would hit its own RLS policies inside the EXPLAIN.
--   * Its query list is a hardcoded array of literals. The only value that
--     varies is a uuid, bound through format(%L). There is no injection
--     surface because there is no caller-supplied SQL.
--   * It executes EXPLAIN ANALYZE, which RUNS the statements. Every one of
--     them is a plain SELECT. There is no INSERT, UPDATE, DELETE or RPC in
--     the list, and nothing here can move money or change a row.
--   * It is revoked from public, anon and authenticated like every other
--     operator-only object in this schema.
create or replace function explain_hot_query_plans(p_user_id uuid default null)
returns table (query_name text, forced_index boolean, plan_line text)
language plpgsql
set search_path = public
as $fn$
declare
  v_user uuid;
  v_probe record;
  v_line text;
  v_forced boolean;
begin
  -- Any real user id produces a representative plan; the point is the shape of
  -- the access path, not whose rows come back. Falls back to a zero uuid so the
  -- function still works on an empty database.
  v_user := coalesce(
    p_user_id,
    (select id from profiles order by created_at limit 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  );

  for v_probe in
    select *
    from (values
      -- ── the customer paths ──────────────────────────────────────────────
      -- src/lib/transactions.ts queryTransactions, the /transactions page
      -- with a date range.
      ('transactions by user and date',
       format($q$select * from transactions where user_id = %L
               and created_at >= now() - interval '90 days'
               order by created_at desc limit 21$q$, v_user)),

      -- src/lib/transactions.ts queryTransactions with filters.currency —
      -- every render of /accounts/[currency]. The OR is the either-side
      -- currency match; it is the single hottest customer query in the app
      -- after the wallet read.
      ('transactions by user and currency, either side',
       format($q$select * from transactions where user_id = %L
               and (currency = 'NGN'
                    or (target_currency = 'NGN' and type <> 'pay_to_china'))
               order by created_at desc limit 6$q$, v_user)),

      -- The /transactions filter tabs: Withdrawals, Conversions, Pay to China.
      ('transactions by user and type',
       format($q$select * from transactions where user_id = %L
               and type = 'withdrawal' order by created_at desc limit 21$q$, v_user)),

      -- src/lib/transactions.ts queryDeposits — the Deposits tab and every
      -- account page.
      ('deposits by user',
       format($q$select * from deposits where user_id = %L
               order by created_at desc limit 21$q$, v_user)),
      ('deposits by user and currency',
       format($q$select * from deposits where user_id = %L and currency = 'NGN'
               order by created_at desc limit 6$q$, v_user)),

      -- src/lib/transactions.ts queryBills.
      ('bill_payments by user and currency',
       format($q$select * from bill_payments where user_id = %L and currency = 'NGN'
               order by created_at desc limit 6$q$, v_user)),

      -- unread_notification_count() from 0017 — the bell badge, polled.
      ('notifications unread count (the bell badge)',
       format($q$select count(*)::integer from notifications n
               where (n.user_id = %L or n.user_id is null)
                 and not exists (select 1 from notification_reads r
                                 where r.notification_id = n.id and r.user_id = %L)$q$,
              v_user, v_user)),

      -- unread_support_count() from 0017 — the support badge, polled.
      ('support unread count (the support badge)',
       format($q$select count(*)::integer from support_messages
               where user_id = %L and sender = 'admin' and read_at is null$q$, v_user)),

      -- ── the operator paths ──────────────────────────────────────────────
      -- src/app/admin/withdrawals/page.tsx, default view.
      ('admin withdrawal queue',
       $q$select * from transactions where type = 'withdrawal'
          and status in ('pending', 'processing') order by created_at$q$),

      -- The same page's ?filter=flagged, and admin_dashboard_stats'
      -- withdrawals_flagged.
      ('admin withdrawal queue, needing extra verification',
       $q$select * from transactions where type = 'withdrawal'
          and status in ('pending', 'processing')
          and requires_extra_verification
          and extra_verification_confirmed_at is null order by created_at$q$),

      -- The same page's ?filter=broken, and admin_dashboard_stats'
      -- automation_failed.
      ('admin withdrawal queue, automation failed',
       $q$select * from transactions where type = 'withdrawal'
          and status in ('pending', 'processing')
          and automated_payout_attempt_failed_reason is not null
          order by created_at$q$),

      -- src/app/admin/pay-to-china/page.tsx — the RMB queue.
      ('admin RMB queue',
       $q$select * from transactions where type = 'pay_to_china'
          and status = 'pending' order by created_at limit 200$q$),

      -- src/app/admin/pnl/page.tsx — every completed order, paged.
      ('admin PNL, completed orders',
       $q$select id, created_at, type, provider, currency, amount, target_currency,
                 target_amount, actual_target_amount, raw_target_amount
          from transactions
          where type in ('convert', 'withdrawal', 'pay_to_china')
            and status = 'completed'
          order by created_at desc, id desc limit 1001$q$),

      -- The same page's supplier rate table, read whole and sorted.
      ('admin PNL, supplier rates',
       $q$select base_currency, quote_currency, buy_rate, effective_from
          from supplier_rates order by effective_from desc$q$),

      -- src/app/admin/kyc/page.tsx — the verification queue, oldest first.
      ('admin KYC queue',
       $q$select id, email, full_name, kyc_status, kyc_submitted_at from profiles
          where kyc_status = 'pending' order by kyc_submitted_at nulls last$q$),

      -- src/app/admin/transactions/page.tsx reading admin_activity_ledger
      -- (0027) — a three-way union all, sorted and paged.
      ('admin ledger, first page',
       $q$select * from admin_activity_ledger order by created_at desc, id desc limit 51$q$),

      -- src/lib/actions/support.ts listSupportThreads — EVERY support message,
      -- newest first, paged to the end. The admin inbox.
      ('admin support inbox, all threads newest first',
       $q$select user_id, sender, body, attachment_ref, read_at, created_at
          from support_messages order by created_at desc, id desc limit 1001$q$),

      -- src/app/admin/notifications/page.tsx.
      ('admin notifications, newest first',
       $q$select id, user_id, title, body, created_at from notifications
          order by created_at desc, id desc limit 51$q$),

      -- src/app/admin/activity/page.tsx.
      ('admin activity log, newest first',
       $q$select * from admin_activity_log order by created_at desc, id desc limit 51$q$),

      -- admin_dashboard_stats' users_new_7d and transactions_completed_7d —
      -- the two of its fifteen counts with no index behind them.
      ('admin dashboard, new users this week',
       $q$select count(*) from profiles where created_at > now() - interval '7 days'$q$),
      ('admin dashboard, completed transactions this week',
       $q$select count(*) from transactions
          where status = 'completed' and created_at > now() - interval '7 days'$q$),

      -- ── the cron paths ──────────────────────────────────────────────────
      ('cron, deposits past their transfer deadline',
       $q$select * from deposits where status = 'pending'
          and pay_in_expires_at < now()$q$),
      ('cron, withdrawals whose automation failed',
       $q$select id, user_id, currency, amount from transactions
          where type = 'withdrawal' and status = 'pending'
            and automated_payout_attempt_failed_reason is not null
            and automated_payout_retry_count < 3$q$)
    ) as t(label, stmt)
  loop
    -- Natural plan, then the same query with seq scans disabled. The second
    -- is the one that answers "is this shape index-able", which is the only
    -- question an empty table can answer. See the note at the top of the file.
    foreach v_forced in array array[false, true]
    loop
      -- set_config(..., is_local => true) rather than SET: scoped to this
      -- transaction, so a failed probe cannot leave the planner crippled for
      -- anything that runs after it.
      perform set_config('enable_seqscan', case when v_forced then 'off' else 'on' end, true);

      for v_line in execute 'explain (analyze, verbose, buffers) ' || v_probe.stmt
      loop
        query_name := v_probe.label;
        forced_index := v_forced;
        plan_line := v_line;
        return next;
      end loop;
    end loop;
  end loop;

  perform set_config('enable_seqscan', 'on', true);
end;
$fn$;

comment on function explain_hot_query_plans(uuid) is
  'Operator diagnostic. EXPLAIN ANALYZE over every hot read path in the app, each shown with the planner free and again with enable_seqscan off. Plain SELECTs only; runs with the caller''s own rights; service role only.';

revoke all on function explain_hot_query_plans(uuid) from public, anon, authenticated;


-- The BEFORE plans, printed by `supabase db push` so the state the indexes
-- were chosen against is on the record rather than only in a report.
do $probe$
declare
  r record;
begin
  raise notice '════ 0032 PLANS BEFORE ════';
  for r in select * from explain_hot_query_plans() loop
    raise notice '[%|%] %', r.query_name, case when r.forced_index then 'forced' else 'natural' end, r.plan_line;
  end loop;
end;
$probe$;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. THE CUSTOMER PATHS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Every one of these is a (user_id, <predicate>, created_at desc) composite,
-- and the reason they are worth having when `transactions_user_created_idx`
-- already starts with user_id is the ORDER BY, not the filter.
--
-- With (user_id, created_at desc) alone, /accounts/NGN asks for one user's
-- six most recent NGN rows and Postgres must walk that user's ENTIRE history
-- newest-first, discarding every row in another currency, until it has found
-- six. For a user who holds five currencies and converts mostly in USDT, that
-- is five times the work for the same six rows, and it gets worse the longer
-- they are a customer — which is precisely backwards. With currency in the
-- index ahead of created_at, the six rows are six adjacent index entries.

-- The either-side currency match in queryTransactions needs BOTH legs
-- indexed or the BitmapOr has one fast side and one slow one, and the slow
-- side sets the latency.
create index if not exists transactions_user_currency_created_idx
  on transactions (user_id, currency, created_at desc);

-- Partial because target_currency is null on every withdrawal, and a
-- withdrawal can never match the target-side leg. Excluding them keeps the
-- index to the rows that can actually be returned by it.
create index if not exists transactions_user_target_currency_created_idx
  on transactions (user_id, target_currency, created_at desc)
  where target_currency is not null;

-- The /transactions filter tabs. Same argument as above: without type in the
-- index, "show me my withdrawals" walks the conversions too.
create index if not exists transactions_user_type_created_idx
  on transactions (user_id, type, created_at desc);

create index if not exists deposits_user_currency_created_idx
  on deposits (user_id, currency, created_at desc);

create index if not exists bill_payments_user_currency_created_idx
  on bill_payments (user_id, currency, created_at desc);


-- ════════════════════════════════════════════════════════════════════════════
-- 3. THE LEDGER'S TIEBREAK
-- ════════════════════════════════════════════════════════════════════════════
--
-- admin_activity_ledger (0027) is `union all` over three tables, and
-- /admin/transactions reads it `order by created_at desc, id desc`. The id
-- tiebreak is not decoration — 0027's own comment explains it, and it is
-- correct: two rows written in the same millisecond swap places between pages
-- without it, which both skips and duplicates rows in a money ledger.
--
-- But it is also what stopped the sort from being free. 0027 added
-- (created_at desc) to each of the three tables, which lets Postgres read
-- each branch in order and MergeAppend them — right up until the second sort
-- key, which no index provides, forcing a full Sort of the entire union
-- before the LIMIT can apply. Three tables' worth of money rows, sorted, to
-- show fifty.
--
-- Adding id to each index restores the MergeAppend. And since (created_at
-- desc, id desc) answers every query (created_at desc) answered, 0027's three
-- indexes are dropped below rather than left to be paid for on every insert.
create index if not exists transactions_created_id_idx
  on transactions (created_at desc, id desc);
create index if not exists deposits_created_id_idx
  on deposits (created_at desc, id desc);
create index if not exists bill_payments_created_id_idx
  on bill_payments (created_at desc, id desc);

-- Same shape, same page-stability reason, in /admin/activity.
create index if not exists admin_activity_log_created_id_idx
  on admin_activity_log (created_at desc, id desc);


-- ════════════════════════════════════════════════════════════════════════════
-- 4. THE OPERATOR QUEUES
-- ════════════════════════════════════════════════════════════════════════════
--
-- 0001's transactions_status_type_idx is (status, type) with no third column,
-- so it finds a queue's rows and then sorts them. Every queue on /admin is
-- ordered — oldest-first while it is a queue, newest-first once it is a log —
-- and the sort is over the whole matched set before the limit applies.
--
-- (type, status, created_at) rather than (status, type, created_at): type is
-- the predicate that is always an equality here, status is sometimes an `in`
-- of two values, and a btree can only range-scan after its last equality
-- column. Leading with type keeps created_at usable for ordering in the
-- `status in ('pending','processing')` case, which is the withdrawal queue —
-- the busiest one.
--
-- Ascending, not descending: the open queues are read oldest-first, and a
-- btree is scanned backwards for the settled views at no extra cost.
create index if not exists transactions_type_status_created_idx
  on transactions (type, status, created_at);

-- /admin/pnl reads every completed order, and admin_dashboard_stats counts
-- the completed ones from the last seven days. Both are status-equality plus
-- a created_at range or order, which (status, type) cannot serve and
-- (created_at desc, id desc) serves only by scanning every row ever.
create index if not exists transactions_status_created_idx
  on transactions (status, created_at desc);

-- The two withdrawal queues that are not a status: a flagged withdrawal and
-- one whose automation broke. Partial, because both are meant to be rare —
-- the whole point of the queue is that it is short — so the index stays
-- small enough to be read end-to-end, and it indexes exactly the rows an
-- operator is being asked to look at.
--
-- Each serves both the /admin/withdrawals filter and the matching count in
-- admin_dashboard_stats, which is why they are worth two more indexes on this
-- table rather than one: the dashboard badge and the queue behind it must not
-- disagree, and they only cannot disagree if they read the same rows.
create index if not exists transactions_extra_verification_idx
  on transactions (created_at)
  where requires_extra_verification and extra_verification_confirmed_at is null;

create index if not exists transactions_automation_failed_idx
  on transactions (created_at)
  where automated_payout_attempt_failed_reason is not null;

-- /admin/pnl again: supplier_rates is read WHOLE and sorted by
-- effective_from. 0026's index leads with the currency pair, so it cannot
-- order an unfiltered read. This table grows by a row every time an operator
-- records a rate and is never pruned, so "it is small" is true today and is
-- not a property to rely on.
create index if not exists supplier_rates_effective_idx
  on supplier_rates (effective_from desc);


-- ════════════════════════════════════════════════════════════════════════════
-- 5. THE TWO GLOBAL READS WITH NO INDEX AT ALL
-- ════════════════════════════════════════════════════════════════════════════
--
-- These are the two worst shapes in the codebase, and both are invisible in
-- the current numbers because the tables have three rows and none.
--
-- listSupportThreads() reads EVERY support message in the product, ordered
-- newest-first, paging to the end, and groups them in TypeScript. 0017
-- indexed (user_id, created_at) — per thread, which is the other access
-- path — so the inbox has nothing to read in order and sorts the entire
-- table on every open. The index does not make the read bounded (that needs
-- a rollup, noted in the QA report rather than invented here), but it does
-- make it streamable: the page can stop after a page instead of waiting for
-- a sort of everything.
create index if not exists support_messages_created_id_idx
  on support_messages (created_at desc, id desc);

-- /admin/notifications has the same shape and the same gap: 0017's
-- (user_id, created_at desc) is per-user and the broadcast index is partial
-- on `user_id is null`, so the admin list — which is neither — sorts the
-- whole table.
create index if not exists notifications_created_id_idx
  on notifications (created_at desc, id desc);

-- admin_dashboard_stats' users_new_7d. profiles has indexes for pending KYC
-- and for suspension, both partial, and nothing on created_at — so counting
-- this week's signups reads every profile that has ever existed. It is one
-- of fifteen counts in a single RPC, which means it sets the floor for the
-- whole admin landing page and the nav badges on all thirteen admin screens.
create index if not exists profiles_created_idx
  on profiles (created_at desc);


-- ════════════════════════════════════════════════════════════════════════════
-- 6. THE THREE DROPS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Strict subsets of the indexes created in section 3. A btree on (a) answers
-- nothing that a btree on (a, b) does not answer identically — same leading
-- column, same range scans, same ordering, same backwards scan. Keeping both
-- buys nothing and costs an extra index write on every insert and update to
-- the three tables that record money movement.
--
-- Measured first rather than assumed: all three had 0 index scans on the live
-- project at the time of writing (`supabase inspect db index-stats`), so
-- nothing is in flight that depends on them.
--
-- Indexes only. No grant, policy or constraint is affected, and each is
-- recreatable in one statement if this judgement turns out wrong.
drop index if exists transactions_created_idx;     -- ⊂ transactions_created_id_idx
drop index if exists deposits_created_idx;         -- ⊂ deposits_created_id_idx
drop index if exists bill_payments_created_idx;    -- ⊂ bill_payments_created_id_idx
drop index if exists admin_activity_log_created_idx; -- ⊂ admin_activity_log_created_id_idx


-- ════════════════════════════════════════════════════════════════════════════
-- 7. STATISTICS, THEN THE AFTER PLANS
-- ════════════════════════════════════════════════════════════════════════════
--
-- A new index the planner has no statistics for is an index the planner will
-- not choose. Analyzing here means the first request after this migration
-- gets the plan the migration intended, rather than the one autovacuum
-- eventually gets round to enabling.
analyze transactions;
analyze deposits;
analyze bill_payments;
analyze support_messages;
analyze notifications;
analyze profiles;
analyze supplier_rates;
analyze admin_activity_log;

do $probe$
declare
  r record;
begin
  raise notice '════ 0032 PLANS AFTER ════';
  for r in select * from explain_hot_query_plans() loop
    raise notice '[%|%] %', r.query_name, case when r.forced_index then 'forced' else 'natural' end, r.plan_line;
  end loop;
end;
$probe$;

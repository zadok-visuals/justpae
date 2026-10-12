-- ============================================================================
-- justpae 0017 — in-app notifications and support chat.
--
-- Ported from the architecture this app's server side came from (its
-- migrations 0037, 0040 and 0046), with TWO deliberate corrections. Both are
-- the same class of bug Phase 1 just spent four migrations closing, so
-- reproducing them here would be indefensible.
--
-- CORRECTION 1 — broadcast read state was shared by everyone.
--   The original put a single `read_at` column on the notification row, with a
--   null user_id meaning "broadcast to all". Its own header flagged the
--   consequence as a known simplification: the FIRST user to open a broadcast
--   marks it read for every other recipient. So the bell count is wrong for
--   everyone but one person, which makes the whole feature untrustworthy —
--   an unread badge nobody believes is worse than no badge.
--   Here read state lives in notification_reads, one row per (notification,
--   user). A broadcast is read by the people who have actually read it.
--
-- CORRECTION 2 — "mark read" policies allowed rewriting the content.
--   Both original tables had `for update using (auth.uid() = user_id)` so a
--   user could mark things read. An UPDATE policy constrains WHICH ROWS, never
--   which COLUMNS — the identical mistake that let a user set their own
--   kyc_status to 'approved' (see 0011). Here a user could have rewritten the
--   title and body of a notification, or the body and sender of a support
--   message, turning the support thread into something they author both sides
--   of. There is no UPDATE grant for users on either table at all: notifications
--   are read-only to them, read state is an INSERT into a separate table, and
--   support read receipts are set by the other party's side.
-- ============================================================================

-- ── notifications ──────────────────────────────────────────────────────────
-- user_id null means a broadcast to every user. Written only by the service
-- role from the admin-gated compose action; there is no insert policy for
-- users, the same convention as every other admin-written table here.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete cascade,
  title text not null,
  body text not null,
  /** Optional in-app destination, e.g. '/transactions'. Never an external URL:
      a notification that can link anywhere is a phishing primitive. */
  href text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  constraint notifications_title_not_blank check (trim(title) <> ''),
  constraint notifications_body_not_blank check (trim(body) <> ''),
  -- Relative paths only, enforced in the schema rather than trusted from the
  -- admin compose form.
  constraint notifications_href_is_relative check (href is null or href ~ '^/[A-Za-z0-9/_?=&.-]*$')
);

create index notifications_user_created_idx on notifications (user_id, created_at desc);
create index notifications_broadcast_created_idx on notifications (created_at desc)
  where user_id is null;

alter table notifications enable row level security;

create policy "notifications: read own or broadcast" on notifications
  for select using (user_id = auth.uid() or user_id is null);

-- No insert, update or delete policy, and the write grants are revoked so a
-- policy added later by accident still cannot let a user author or edit one.
revoke insert, update, delete on notifications from public, anon, authenticated;

-- ── notification_reads ─────────────────────────────────────────────────────
-- Per-user read state. The fix for correction 1 above.
create table notification_reads (
  notification_id uuid not null references notifications (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index notification_reads_user_idx on notification_reads (user_id);

alter table notification_reads enable row level security;

create policy "notification_reads: read own" on notification_reads
  for select using (user_id = auth.uid());

-- Insert-only, own rows. Marking something read is append-only by nature —
-- there is nothing to update and nothing a user gains from deleting one.
create policy "notification_reads: insert own" on notification_reads
  for insert with check (user_id = auth.uid());

revoke update, delete on notification_reads from public, anon, authenticated;

-- ── Unread count and mark-read, as functions ───────────────────────────────
-- The count is a function rather than a client-side query because "visible to
-- me and not yet read by me" is an anti-join the client would have to
-- reimplement, and a bell badge that disagrees with the list is worse than no
-- badge.
create function unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from notifications n
  where (n.user_id = auth.uid() or n.user_id is null)
    and not exists (
      select 1 from notification_reads r
      where r.notification_id = n.id and r.user_id = auth.uid()
    );
$$;

grant execute on function unread_notification_count() to authenticated;

-- Idempotent: opening the dropdown twice is not an error, and `on conflict do
-- nothing` keeps the first read_at rather than refreshing it.
create function mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into notification_reads (notification_id, user_id)
  select n.id, v_user_id
  from notifications n
  where (n.user_id = v_user_id or n.user_id is null)
  on conflict (notification_id, user_id) do nothing;
end;
$$;

grant execute on function mark_all_notifications_read() to authenticated;

-- Written by the admin-gated action through the service role. Takes the admin's
-- id so the ledger can say who sent it. A null p_user_id is a broadcast.
create function admin_send_notification(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_href text,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into notifications (user_id, title, body, href, created_by)
  values (p_user_id, trim(p_title), trim(p_body), nullif(trim(coalesce(p_href, '')), ''), p_created_by)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function admin_send_notification(uuid, text, text, text, uuid)
  from public, anon, authenticated;

-- ============================================================================
-- ── support chat ───────────────────────────────────────────────────────────
-- One thread per user, identified by user_id. Admins always read and write
-- through the service-role client, so the policies below cover only the user's
-- own side.
-- ============================================================================
create table support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  sender text not null check (sender in ('user', 'admin')),
  -- Nullable: an image-only message has no text. The constraint below is what
  -- stops a message that is neither.
  body text,
  /** Path into the private support-attachments bucket. */
  attachment_ref text,
  /** Set when the OTHER side has seen it — the user's side is stamped by
   *  mark_support_thread_read below, the admin's by the admin action. */
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_messages_body_or_attachment check (
    coalesce(trim(body), '') <> '' or attachment_ref is not null
  )
);

create index support_messages_user_created_idx on support_messages (user_id, created_at);
-- Powers the admin inbox's unread-per-thread badge without a full scan.
create index support_messages_unread_idx on support_messages (user_id, sender)
  where read_at is null;

alter table support_messages enable row level security;

create policy "support_messages: read own thread" on support_messages
  for select using (auth.uid() = user_id);

-- A user may only ever insert as 'user'. Without `sender = 'user'` in the
-- check, they could author messages attributed to support in their own thread
-- and then present that thread as evidence of what they were told.
create policy "support_messages: send own" on support_messages
  for insert with check (auth.uid() = user_id and sender = 'user');

-- The table-wide INSERT has to be revoked BEFORE the column grant, because
-- Supabase's default privileges already granted `all` on this table to
-- authenticated the moment it was created. Granting columns without revoking
-- first leaves the broader table-wide grant in place and the column list is
-- decorative — the same "we never granted it is not the same as they cannot do
-- it" trap Phase 1 was built around.
--
-- read_at is excluded: a user stamping their own message as already-read is
-- harmless but meaningless, and the column belongs to the other party.
revoke insert on support_messages from public, anon, authenticated;
grant insert (user_id, sender, body, attachment_ref) on support_messages to authenticated;

-- NO update policy and no update grant. Correction 2 above: the original
-- allowed a row-scoped UPDATE so the user could stamp read_at, which also let
-- them rewrite `body` and `sender` on their own messages. Read receipts go
-- through the function below instead, which can only ever touch read_at.
revoke update, delete on support_messages from public, anon, authenticated;

-- Marks the ADMIN's messages in the caller's own thread as read. Deliberately
-- not parameterised by thread: auth.uid() is the thread.
create function mark_support_thread_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update support_messages
  set read_at = now()
  where user_id = v_user_id and sender = 'admin' and read_at is null;
end;
$$;

grant execute on function mark_support_thread_read() to authenticated;

-- The user's own unread count — admin messages they haven't seen.
create function unread_support_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from support_messages
  where user_id = auth.uid() and sender = 'admin' and read_at is null;
$$;

grant execute on function unread_support_count() to authenticated;

-- ── Admin side, service role only ──────────────────────────────────────────
create function admin_send_support_message(
  p_user_id uuid,
  p_body text,
  p_attachment_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into support_messages (user_id, sender, body, attachment_ref)
  values (p_user_id, 'admin', nullif(trim(coalesce(p_body, '')), ''), p_attachment_ref)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function admin_send_support_message(uuid, text, text)
  from public, anon, authenticated;

create function admin_mark_support_thread_read(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update support_messages
  set read_at = now()
  where user_id = p_user_id and sender = 'user' and read_at is null;
end;
$$;

revoke execute on function admin_mark_support_thread_read(uuid) from public, anon, authenticated;

-- ── The private attachments bucket ─────────────────────────────────────────
-- Same shape as kyc-documents: one folder per user, nothing public.
-- file_size_limit and allowed_mime_types are enforced by Storage itself on
-- every upload, so the 5MB image-only rule holds even for a client that skips
-- the app's own checks — which is the point of setting them here rather than
-- only in TypeScript.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A user reads and writes only their own folder, matched on the first path
-- segment exactly as the kyc-documents policies do. The admin has no RLS path
-- into anyone's folder: admin uploads go through a signed upload URL minted
-- with the service role, which bypasses RLS by design.
create policy "support-attachments: insert own folder" on storage.objects
  for insert with check (
    bucket_id = 'support-attachments' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "support-attachments: read own folder" on storage.objects
  for select using (
    bucket_id = 'support-attachments' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── Extend the Phase 1 allowlist ───────────────────────────────────────────
-- assert_phase1_invariants asserts that NOTHING outside its allowlist is
-- executable by a user session. This migration adds five such functions, so
-- the allowlist is extended here — deliberately by editing the assertion
-- rather than by weakening it, so every addition has to be stated and
-- justified in the same place the rule lives.
--
-- Each of the five:
--   unread_notification_count()      boolean-ish count, auth.uid()-scoped, no args
--   mark_all_notifications_read()    inserts read receipts for the caller only
--   unread_support_count()           count, auth.uid()-scoped, no args
--   mark_support_thread_read()       stamps read_at on the caller's own thread
--   assert_phase3_invariants()       reports configuration, moves nothing
-- None takes a value that affects money, and none takes a user id at all —
-- every one derives its subject from auth.uid().
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
    -- Phase 3 — see the note above
    'unread_notification_count',
    'mark_all_notifications_read',
    'unread_support_count',
    'mark_support_thread_read',
    'assert_phase3_invariants'
  ];
  v_must_not_exist text[] := array[
    'create_conversion',
    'create_bill_payment',
    'set_transaction_provider_reference',
    'change_withdrawal_pin',
    'request_recipient_change',
    'confirm_recipient_change'
  ];
  v_offenders text;
  v_count integer;
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
  where a.name not in ('assert_phase1_invariants', 'assert_phase3_invariants')
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
    raise exception 'PHASE 1 REGRESSION: these functions were dropped for taking caller-supplied money values and have come back: %', v_offenders;
  end if;

  select string_agg(c.column_name, ', ') into v_offenders
  from information_schema.column_privileges c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.privilege_type = 'UPDATE'
    and c.grantee in ('authenticated', 'anon', 'PUBLIC')
    and c.column_name <> 'phone';

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION (1.2): a user session can UPDATE these profiles columns: %. Only phone may be granted — kyc_status in this list is the self-approval hole.', v_offenders;
  end if;

  if not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and privilege_type = 'UPDATE' and grantee = 'authenticated' and column_name = 'phone'
  ) then
    raise exception 'PHASE 1 REGRESSION (1.2): authenticated cannot update profiles.phone, which it legitimately should.';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'profiles_guard_protected_columns' and not tgisinternal
  ) then
    raise exception 'PHASE 1 REGRESSION (1.2): the profiles_guard_protected_columns trigger is missing.';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'kyc_documents_force_pending_status' and not tgisinternal
  ) then
    raise exception 'PHASE 1 REGRESSION (1.2): the kyc_documents_force_pending_status trigger is missing.';
  end if;

  select string_agg(distinct c.privilege_type, ', ') into v_offenders
  from information_schema.column_privileges c
  where c.table_schema = 'public'
    and c.table_name = 'kyc_documents'
    and c.column_name = 'status'
    and c.privilege_type in ('INSERT', 'UPDATE')
    and c.grantee in ('authenticated', 'anon', 'PUBLIC');

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION (1.2): a user session holds % on kyc_documents.status — it could mark its own documents approved.', v_offenders;
  end if;

  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'withdrawal_pins';

  if v_count > 0 then
    raise exception 'PHASE 1 REGRESSION (1.4a): withdrawal_pins has % RLS policy/policies. Any SELECT policy also exposes pin_hash.', v_count;
  end if;

  select string_agg(distinct privilege_type, ', ') into v_offenders
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'withdrawal_pins'
    and grantee in ('authenticated', 'anon', 'PUBLIC');

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION (1.4a): a user session holds % on withdrawal_pins.', v_offenders;
  end if;

  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'conversion_quotes';

  if v_count > 0 then
    raise exception 'PHASE 1 REGRESSION (1.1): conversion_quotes has % RLS policy/policies and must have none.', v_count;
  end if;

  select string_agg(distinct privilege_type, ', ') into v_offenders
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'conversion_quotes'
    and grantee in ('authenticated', 'anon', 'PUBLIC');

  if v_offenders is not null then
    raise exception 'PHASE 1 REGRESSION (1.1): a user session holds % on conversion_quotes.', v_offenders;
  end if;

  if not exists (
    select 1 from pg_tables where schemaname = 'public'
      and tablename = 'conversion_quotes' and rowsecurity
  ) then
    raise exception 'PHASE 1 REGRESSION (1.1): RLS is not enabled on conversion_quotes.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'transactions_provider_reference_unique'
  ) then
    raise exception 'PHASE 1 REGRESSION (1.1e): the unique index on transactions(provider, provider_reference) is missing.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'deposits_provider_reference_unique'
  ) then
    raise exception 'PHASE 1 REGRESSION (1.1e): the unique index on deposits(provider, provider_reference) is missing.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'withdrawal_pins'
      and column_name in ('failed_attempts', 'locked_until')
    group by table_name having count(*) = 2
  ) then
    raise exception 'PHASE 1 REGRESSION (1.4b): withdrawal_pins is missing failed_attempts and/or locked_until.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions'
      and column_name in ('needs_manual_review', 'manual_review_reason')
    group by table_name having count(*) = 2
  ) then
    raise exception 'PHASE 1 REGRESSION (1.1f): transactions is missing needs_manual_review and/or manual_review_reason.';
  end if;

  return true;
end;
$$;

grant execute on function assert_phase1_invariants() to authenticated;

-- ── Extend the Phase 1 invariants to cover these tables ────────────────────
-- The two corrections above are exactly the kind of thing a later migration
-- could undo with one careless `for update using (...)`. Folding them into the
-- standing assertion means that would be caught rather than discovered.
create or replace function assert_phase3_invariants()
returns boolean
language plpgsql
as $$
declare
  v_offenders text;
begin
  -- No user-session UPDATE on either table, at any column.
  select string_agg(distinct c.table_name || '.' || c.column_name, ', ') into v_offenders
  from information_schema.column_privileges c
  where c.table_schema = 'public'
    and c.table_name in ('notifications', 'support_messages', 'notification_reads')
    and c.privilege_type = 'UPDATE'
    and c.grantee in ('authenticated', 'anon', 'PUBLIC');

  if v_offenders is not null then
    raise exception 'PHASE 3 REGRESSION: a user session can UPDATE %. Notification and support-message content must be read-only to users — an UPDATE policy constrains rows, never columns.', v_offenders;
  end if;

  -- A user must not be able to author a support message as the admin.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'support_messages'
      and cmd = 'INSERT' and coalesce(with_check, '') like '%sender%'
  ) then
    raise exception 'PHASE 3 REGRESSION: the support_messages insert policy no longer constrains `sender`, so a user could post as support in their own thread.';
  end if;

  -- The attachments bucket must stay private, size-capped and image-only.
  if not exists (
    select 1 from storage.buckets
    where id = 'support-attachments'
      and public = false
      and file_size_limit is not null
      and allowed_mime_types is not null
  ) then
    raise exception 'PHASE 3 REGRESSION: the support-attachments bucket is public, uncapped, or accepts any MIME type.';
  end if;

  return true;
end;
$$;

grant execute on function assert_phase3_invariants() to authenticated;

do $$
begin
  perform assert_phase1_invariants();
  perform assert_phase3_invariants();
  raise notice 'Phase 1 and Phase 3 invariants hold.';
end;
$$;

-- ============================================================================
-- justpae 0031 — "tell me when this opens", and one more bill category.
--
-- Both belong to Group 4e, which makes Bills and Flights visible in a
-- MAINTENANCE state while their providers are being verified.
--
-- ── WHY A NEW TABLE AND NOT A COLUMN ON profiles ───────────────────────────
--
-- The obvious home for "notify me when flights open" is a boolean on
-- profiles. It is the wrong home here, and 0011 is the reason.
--
-- 0011 revoked table-wide UPDATE on profiles and re-granted it on exactly the
-- columns a user may edit, backed by a BEFORE UPDATE trigger that raises on
-- anything else arriving as an end-user request. That design is why a user
-- cannot PATCH themselves to kyc_status = 'approved'. Adding a column there
-- means widening the column grant on the one table in this schema whose
-- narrow grant is load-bearing — to store a marketing preference.
--
-- A separate table keeps that blast radius at zero. The worst a bug here can
-- do is record that somebody is interested in flights.
--
-- ── WHY IT IS GENERIC RATHER THAN flights_notify ───────────────────────────
--
-- There are already three flagged-off features (USD collection, GHS deposits,
-- bills) and this adds a fourth. A table per feature means a migration every
-- time one is added; a row per (user, feature) means none. `feature` is text
-- rather than an enum for the same reason: a new flag should not need a
-- schema change, and an unrecognised value here is inert — nothing reads it
-- except the screen that wrote it.
-- ============================================================================

create table if not exists feature_interest (
  user_id uuid not null references profiles (id) on delete cascade,
  feature text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, feature)
);

comment on table feature_interest is
  'Per-user "notify me when this opens" marks for features behind a flag. '
  'Carries no personal data beyond the user id, and nothing reads it except '
  'the screen that wrote it.';

alter table feature_interest enable row level security;

-- A user may see, set and clear their OWN interest, and nothing else. There
-- is deliberately no update policy: the row has no mutable column, so
-- toggling off is a delete rather than a flag flip.
create policy "feature_interest: read own"
  on feature_interest for select
  using (auth.uid() = user_id);

create policy "feature_interest: insert own"
  on feature_interest for insert
  with check (auth.uid() = user_id);

create policy "feature_interest: delete own"
  on feature_interest for delete
  using (auth.uid() = user_id);

-- ── One more bill category ──────────────────────────────────────────────────
--
-- Group 4e lists Education among the categories /bills must show. The UI
-- could show a tile without it, but the standing rule in this codebase is
-- that an unconfirmed provider means "build the full UI, schema and server
-- action, and ship the flag off" — not "draw a tile that has nowhere to go".
--
-- Additive and inert: nothing writes this value while BILLS_ENABLED is off,
-- and `alter type ... add value` on an enum takes no table lock.
alter type bill_category add value if not exists 'education';

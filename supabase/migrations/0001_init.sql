-- ============================================================================
-- justpae 0001 — base schema.
--
-- This is a CONSOLIDATED migration set for a FRESH Supabase project. It is not
-- a replay of the 35 incremental migrations the server-side architecture this
-- app is built on arrived at; it is the final shape those migrations produce,
-- minus everything RMB/CNY (deliberately not built), plus the additions this
-- product needs: a first-class USD wallet for every user, a rate-markup table,
-- an operator-tunable settings table, bill payments and USD collection.
--
-- Discipline carried over wholesale and not to be relaxed:
--   * Every balance change happens inside a Postgres function. No app code
--     ever issues `update wallets set balance = ...`.
--   * RLS is on for every table; a user can read only their own rows.
--   * The service role is used only on the server (webhooks, cron, payout,
--     admin-gated actions) and never reaches a browser bundle.
--   * Functions a user calls directly are `security definer` + granted to
--     `authenticated`, and derive the user from `auth.uid()` — never from a
--     client-supplied id.
--   * Functions only the server calls (via the service-role client) get NO
--     grant to `authenticated`.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Enums ───────────────────────────────────────────────────────────────────
create type kyc_type as enum ('individual', 'business');
create type kyc_status as enum ('not_started', 'pending', 'approved', 'rejected');
create type kyc_tier as enum ('individual_tier_1', 'individual_tier_2', 'individual_tier_3', 'business');
create type document_status as enum ('pending', 'approved', 'rejected');

-- The wallet/ledger currency enum. CNY is deliberately absent rather than
-- present-and-unused: adding it later is one `alter type currency add value
-- 'CNY'` in its own migration (Postgres forbids using a newly added enum value
-- in the transaction that added it, so it must be its own file), plus one entry
-- in CURRENCIES in src/lib/currencies.ts. Nothing else enumerates currencies.
create type currency as enum ('USD', 'NGN', 'GHS', 'KES', 'USDT');

create type transaction_type as enum ('convert', 'withdrawal');
create type transaction_provider as enum ('busha', 'klasha', 'manual');
create type transaction_status as enum ('pending', 'processing', 'completed', 'failed');

create type bill_category as enum ('airtime', 'data', 'electricity', 'water', 'cable_tv');
create type bill_status as enum ('pending', 'processing', 'completed', 'failed', 'refunded');

-- ── profiles ────────────────────────────────────────────────────────────────
-- `country` is plain text holding an ISO 3166-1 alpha-2 code, not an enum: a
-- user's real country is recorded as-is even when no local wallet exists for
-- it. Only NG/GH/KE get a local wallet provisioned (see handle_new_user).
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  business_name text,
  kyc_type kyc_type,
  kyc_status kyc_status not null default 'not_started',
  kyc_rejection_reason text,
  country text,
  created_at timestamptz not null default now()
);

-- ── wallets ─────────────────────────────────────────────────────────────────
create table wallets (
  user_id uuid not null references profiles (id) on delete cascade,
  currency currency not null,
  balance numeric(18, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, currency),
  constraint wallets_balance_non_negative check (balance >= 0)
);

-- ── kyc_documents ───────────────────────────────────────────────────────────
-- File-based inputs (selfie, ID scan, CAC certificate, proof of address) set
-- file_ref, pointing into the private "kyc-documents" storage bucket.
-- Text-based inputs (BVN/NIN, Ghana Card, Huduma number, TIN) set value. Only
-- a pointer or the raw input is stored, never a verification result.
--
-- The unique constraint is what makes a resubmission after rejection REPLACE
-- the previous document of that type instead of inserting a second row
-- alongside it — src/lib/actions/kyc.ts upserts against it.
create table kyc_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  tier kyc_tier not null,
  document_type text not null,
  file_ref text,
  value text,
  status document_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint kyc_documents_has_content check (file_ref is not null or value is not null),
  constraint kyc_documents_user_document_type_key unique (user_id, document_type)
);

-- ── transactions ────────────────────────────────────────────────────────────
-- Internal money movement: conversions and withdrawals. Deposits live in their
-- own table — money entering the system from outside is a different mental
-- model, and conflating the two makes the Transactions page incoherent.
--
-- The rate audit trail (provider_rate / markup_rate / customer_rate /
-- raw_target_amount) is recorded on every conversion so /admin/pnl can report
-- profit per order. The gap between raw_target_amount (what the provider
-- actually delivered) and target_amount (what the customer was credited) IS
-- the margin. Without these columns the markup collected on a completed order
-- is unrecoverable after the fact.
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type transaction_type not null,
  provider transaction_provider not null,
  status transaction_status not null default 'pending',
  amount numeric(18, 2) not null,
  currency currency not null,
  target_currency currency,
  target_amount numeric(18, 2),
  actual_target_amount numeric(18, 2),
  provider_reference text,
  provider_rate numeric(24, 10),
  markup_rate numeric(10, 6),
  customer_rate numeric(24, 10),
  raw_target_amount numeric(18, 2),
  fee numeric(18, 2),
  requires_extra_verification boolean not null default false,
  extra_verification_confirmed_at timestamptz,
  extra_verification_confirmed_by uuid references profiles (id),
  automated_payout_attempt_failed_reason text,
  automated_payout_retry_count integer not null default 0,
  decline_reason text,
  created_at timestamptz not null default now()
);

create index transactions_user_created_idx on transactions (user_id, created_at desc);
create index transactions_status_type_idx on transactions (status, type);
-- Supports the retry-withdrawal-automation cron's lookup of withdrawals whose
-- automation attempt failed before a provider transfer ever existed.
create index transactions_automation_retry_idx on transactions (type, status, automated_payout_retry_count)
  where automated_payout_attempt_failed_reason is not null;

-- ── deposits ────────────────────────────────────────────────────────────────
-- `amount` is what was originally requested; `confirmed_amount` is what was
-- actually credited. These genuinely differ: a user can request a 10 USDT
-- deposit and send 12 on-chain, and the provider's transfer object
-- self-corrects to the real figure once funds arrive. Crediting the requested
-- amount in that case short-changes the user, so credit_deposit takes the
-- actual amount and both figures are kept for the detail view.
create table deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  currency currency not null,
  amount numeric(18, 2) not null,
  confirmed_amount numeric(18, 2),
  status transaction_status not null default 'pending',
  provider transaction_provider not null,
  provider_reference text,
  decline_reason text,
  created_at timestamptz not null default now()
);

create index deposits_user_created_idx on deposits (user_id, created_at desc);
create index deposits_status_idx on deposits (status);

-- ── webhook_events ──────────────────────────────────────────────────────────
-- `provider` is text, not the transaction_provider enum: a provider can send
-- webhooks before it is wired into the money path at all, and an unrecognised
-- sender must still be recordable rather than rejected at the type level.
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index webhook_events_provider_created_idx on webhook_events (provider, created_at desc);

-- ── Signup trigger ─────────────────────────────────────────────────────────
-- Every user gets a USD wallet and a USDT wallet. USD is FIRST CLASS here:
-- the architecture this is built on dropped USD provisioning entirely once it
-- had no path to a nonzero balance, but /receive (Feature 1) gives it one, so
-- it is provisioned for everyone regardless of country.
--
-- The local wallet is provisioned from the signup country: NG -> NGN,
-- GH -> GHS, KE -> KES. Any other country (or a missing one) simply gets no
-- local wallet — it is NOT defaulted to Nigeria, which would silently give a
-- user a wallet in a currency they can neither deposit nor withdraw.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text := new.raw_user_meta_data ->> 'country';
  v_local_currency currency := case v_country
    when 'NG' then 'NGN'
    when 'GH' then 'GHS'
    when 'KE' then 'KES'
    else null
  end;
begin
  insert into public.profiles (id, email, full_name, country)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', v_country);

  insert into public.wallets (user_id, currency)
  values (new.id, 'USD'), (new.id, 'USDT');

  if v_local_currency is not null then
    insert into public.wallets (user_id, currency) values (new.id, v_local_currency);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Row Level Security ─────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table wallets enable row level security;
alter table kyc_documents enable row level security;
alter table transactions enable row level security;
alter table deposits enable row level security;
alter table webhook_events enable row level security;

create policy "profiles: read own" on profiles for select using (auth.uid() = id);
create policy "profiles: update own" on profiles for update using (auth.uid() = id);

-- Read-only to the owner. Balances are written exclusively by the
-- security-definer functions in the later migrations, so no insert/update
-- policy exists for `authenticated` at all.
create policy "wallets: read own" on wallets for select using (auth.uid() = user_id);

create policy "kyc_documents: read own" on kyc_documents for select using (auth.uid() = user_id);
create policy "kyc_documents: insert own" on kyc_documents for insert with check (auth.uid() = user_id);
-- An upsert's ON CONFLICT DO UPDATE path needs an UPDATE policy to succeed
-- under RLS — this is what makes KYC resubmission after a rejection work.
create policy "kyc_documents: update own" on kyc_documents for update using (auth.uid() = user_id);

create policy "transactions: read own" on transactions for select using (auth.uid() = user_id);
create policy "deposits: read own" on deposits for select using (auth.uid() = user_id);

-- No user-facing policy on webhook_events: only the service role touches it.

-- ── Private KYC document storage ───────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;

create policy "kyc-documents: read own folder" on storage.objects
  for select using (
    bucket_id = 'kyc-documents' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "kyc-documents: upload own folder" on storage.objects
  for insert with check (
    bucket_id = 'kyc-documents' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "kyc-documents: replace own folder" on storage.objects
  for update using (
    bucket_id = 'kyc-documents' and auth.uid()::text = (storage.foldername(name))[1]
  );

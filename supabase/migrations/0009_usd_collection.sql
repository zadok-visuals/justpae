-- ============================================================================
-- justpae 0009 — USD receiving details (/receive).
--
-- One row per user holding whatever the USD collection provider issues: a
-- virtual account number with a routing number for ACH, a bank name and
-- address for wire, and a reference code the sender must quote.
--
-- Every column except reference_code is nullable on purpose. Which fields a
-- provider actually issues is not yet known — the user has not confirmed which
-- provider will issue USD collection on this account — so the table records
-- what arrives rather than asserting a shape no provider has agreed to. The
-- reference code is ours, generated at row creation, and is the one field that
-- always exists.
--
-- Rows are created ONLY by the server, and a USD balance is credited ONLY from
-- a verified provider webhook (which goes through credit_deposit like every
-- other deposit). Nothing in the client can create a receiving account or
-- credit USD.
-- ============================================================================

create table usd_collection_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  provider text not null,
  account_name text,
  account_number text,
  routing_number text,
  bank_name text,
  bank_address text,
  account_type text,
  reference_code text not null unique,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint usd_collection_accounts_user_key unique (user_id),
  constraint usd_collection_accounts_status_check check (status in ('pending', 'active', 'disabled'))
);

alter table usd_collection_accounts enable row level security;

create policy "usd_collection_accounts: read own"
  on usd_collection_accounts for select
  using (auth.uid() = user_id);
-- No insert/update policy: created and updated only by the server, via the
-- service-role client, in response to the provider.

-- Upsert from the provider's response or its webhook. Keyed on user_id so a
-- provider re-issuing details updates the existing row rather than leaving two
-- sets of receiving instructions live at once.
create function upsert_usd_collection_account(
  p_user_id uuid,
  p_provider text,
  p_reference_code text,
  p_account_name text default null,
  p_account_number text default null,
  p_routing_number text default null,
  p_bank_name text default null,
  p_bank_address text default null,
  p_account_type text default null,
  p_status text default 'pending'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into usd_collection_accounts (
    user_id, provider, reference_code, account_name, account_number,
    routing_number, bank_name, bank_address, account_type, status
  )
  values (
    p_user_id, p_provider, p_reference_code, p_account_name, p_account_number,
    p_routing_number, p_bank_name, p_bank_address, p_account_type, p_status
  )
  on conflict (user_id) do update
    set provider = excluded.provider,
        reference_code = excluded.reference_code,
        account_name = excluded.account_name,
        account_number = excluded.account_number,
        routing_number = excluded.routing_number,
        bank_name = excluded.bank_name,
        bank_address = excluded.bank_address,
        account_type = excluded.account_type,
        status = excluded.status
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function upsert_usd_collection_account(
  uuid, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

-- ============================================================================
-- justpae 0002 — operator-tunable settings and per-pair rate markups.
--
-- Both of these replace hardcoded constants. The automation threshold in
-- particular was a literal `1000` buried in a module three files away from any
-- admin surface, which meant changing the risk appetite of the whole payout
-- system needed a code deploy.
-- ============================================================================

-- ── app_settings ───────────────────────────────────────────────────────────
-- Key/value, values stored as text and parsed by the caller. Readable by any
-- authenticated user so the client can render "this withdrawal will be
-- instant" / "this will need approval" before submitting — the threshold is
-- not a secret, and the server re-checks it at execution time regardless.
create table app_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

alter table app_settings enable row level security;

create policy "app_settings: read all" on app_settings for select using (true);
-- No insert/update policy: written only by admin_set_setting below, called via
-- the service-role client from an admin-gated server action.

insert into app_settings (key, value, description) values
  (
    'automated_payout_threshold_usd',
    '1000',
    'Withdrawals at or below this USD-equivalent are paid out automatically; above it they wait for admin approval.'
  ),
  (
    'automated_payout_window_hours',
    '24',
    'Rolling window over which a user''s withdrawals are summed and checked against the same threshold, so one large withdrawal cannot be split into several small automated ones.'
  ),
  (
    'withdrawal_fee_rate',
    '0.01',
    'Withdrawal fee as a fraction of the requested amount.'
  );

create function admin_set_setting(p_key text, p_value text, p_set_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into app_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), p_set_by)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now(),
        updated_by = excluded.updated_by;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, so every admin-only function
-- is explicitly revoked rather than merely left ungranted.
revoke execute on function admin_set_setting(text, text, uuid) from public, anon, authenticated;

-- ── rate_markups ───────────────────────────────────────────────────────────
-- Keyed by ORDERED pair, so NGN->USDT and USDT->NGN are two independent rows.
-- They carry genuinely different spreads on the provider side and an operator
-- needs to price them separately; a single symmetric row would force one
-- number onto both directions.
--
-- Direction convention, used without exception everywhere in this codebase: a
-- rate is QUOTE units per 1 BASE unit. Keeping one direction throughout is
-- what makes the markup maths and the PNL report auditable.
--
-- Readable by any authenticated user: the customer rate shown on /convert and
-- in the Home rate strip is derived from it, and the breakdown is shown openly
-- in the transaction detail view. Nothing here is secret.
create table rate_markups (
  id uuid primary key default gen_random_uuid(),
  base_currency currency not null,
  quote_currency currency not null,
  markup_rate numeric(10, 6) not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  constraint rate_markups_pair_key unique (base_currency, quote_currency),
  constraint rate_markups_distinct_pair check (base_currency <> quote_currency),
  -- A markup of 1 or more would zero out (or invert) the customer rate.
  constraint rate_markups_rate_range check (markup_rate >= 0 and markup_rate < 1)
);

alter table rate_markups enable row level security;

create policy "rate_markups: read all" on rate_markups for select using (true);
-- No insert/update policy: written only by admin_set_rate_markup below.

-- Seed every pair the conversion engine can actually route today at the 0.5%
-- the operator confirmed. GHS pairs are seeded too even though the liquidity
-- provider has no USDT/GHS pair on this account right now — the route is
-- disabled in the UI for that reason, not for a missing markup, and when the
-- pair appears the pricing is already in place.
insert into rate_markups (base_currency, quote_currency, markup_rate)
select base.code, quote.code, 0.005
from (values ('USD'::currency), ('NGN'::currency), ('GHS'::currency), ('KES'::currency), ('USDT'::currency)) as base(code)
cross join (values ('USD'::currency), ('NGN'::currency), ('GHS'::currency), ('KES'::currency), ('USDT'::currency)) as quote(code)
where base.code <> quote.code;

create function admin_set_rate_markup(
  p_base_currency currency,
  p_quote_currency currency,
  p_markup_rate numeric,
  p_set_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_markup_rate < 0 or p_markup_rate >= 1 then
    raise exception 'Markup must be between 0 and 1 (exclusive)';
  end if;

  if p_base_currency = p_quote_currency then
    raise exception 'Base and quote currency must differ';
  end if;

  insert into rate_markups (base_currency, quote_currency, markup_rate, updated_at, updated_by)
  values (p_base_currency, p_quote_currency, p_markup_rate, now(), p_set_by)
  on conflict (base_currency, quote_currency) do update
    set markup_rate = excluded.markup_rate,
        updated_at = now(),
        updated_by = excluded.updated_by;
end;
$$;

revoke execute on function admin_set_rate_markup(currency, currency, numeric, uuid) from public, anon, authenticated;

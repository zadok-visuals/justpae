-- ============================================================================
-- justpae 0044 — room for a BVN verification result, and a provider-down
-- alert that fires once per outage instead of once per request.
--
-- kyc_documents' own comment says "only a pointer or the raw input is stored,
-- never a verification result" — true of the identity-document review flow,
-- and still true here: nothing Dojah returns about WHO the BVN belongs to
-- (name, date of birth, photo) is stored. What is stored is the verdict
-- (matched/unverified), who gave it, and when — enough for an admin to see
-- why a withdrawal-blocking account exists without ever re-deriving a
-- person's identity from this row. Nullable and service-role only: the
-- per-column grant to `authenticated` from 0011 does not list these, so a
-- user session can never set its own verification result.
-- ============================================================================

alter table kyc_documents
  add column verification_result text,
  add column verification_provider text,
  add column verification_checked_at timestamptz;

alter table kyc_documents
  add constraint kyc_documents_verification_result_check
  check (verification_result is null or verification_result in ('matched', 'unverified'));

-- ── provider_alerts — "tell admins once", not once per request ─────────────
-- A Dojah outage can mean hundreds of BVN saves in an hour, each of which
-- must still succeed (saved as 'unverified' — see src/lib/actions/kyc.ts).
-- Without this, each one would also try to email the ops team, which is both
-- noise and, at provider-outage volume, a second outage against the email
-- API. One row per provider; a send is allowed only once per cooldown.
create table provider_alerts (
  provider text primary key,
  last_sent_at timestamptz not null default now()
);

revoke all on table provider_alerts from public, anon, authenticated;

-- Atomic claim: only the caller that successfully moves last_sent_at forward
-- may send the email, so two concurrent requests during the same outage
-- cannot both decide they are the one to alert.
create function claim_provider_alert(p_provider text, p_cooldown_minutes integer default 60)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  insert into provider_alerts (provider, last_sent_at)
  values (p_provider, now())
  on conflict (provider) do update
    set last_sent_at = now()
    where provider_alerts.last_sent_at <= now() - make_interval(mins => p_cooldown_minutes)
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke execute on function claim_provider_alert(text, integer) from public, anon, authenticated;

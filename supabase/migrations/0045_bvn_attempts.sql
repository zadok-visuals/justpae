-- ============================================================================
-- justpae 0045 — at most 5 BVN attempts per user per 24 hours.
--
-- One row per attempt rather than a counter-plus-window-end pair (the shape
-- 0012's PIN lockout uses): a BVN save/change is rare enough per user that a
-- sliding 24-hour window costs nothing to compute, and it is simpler than
-- maintaining a reset timestamp for an action that, unlike a PIN, has no
-- single moment that obviously resets the count (a PIN lockout clears on the
-- next correct PIN; nothing about a BVN attempt is "correct" in that sense —
-- a confirm-field mismatch and a Dojah mismatch both count the same as any
-- other attempt).
--
-- Service-role only: record_bvn_attempt is called from
-- src/lib/actions/kyc.ts with the service role, the same way
-- record_pin_failure is.
-- ============================================================================

create table bvn_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index bvn_attempts_user_created_idx on bvn_attempts (user_id, created_at);

revoke all on table bvn_attempts from public, anon, authenticated;

-- Records one attempt and returns how many this user has made in the last 24
-- hours, THIS ONE INCLUDED. The threshold itself (5) is a TS-side decision —
-- see exceedsBvnAttemptLimit in src/lib/kyc/bvnFlow.ts — kept there rather
-- than here so it is testable without a database.
create function record_bvn_attempt(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into bvn_attempts (user_id) values (p_user_id);

  select count(*) into v_count
  from bvn_attempts
  where user_id = p_user_id and created_at > now() - interval '24 hours';

  return v_count;
end;
$$;

revoke execute on function record_bvn_attempt(uuid) from public, anon, authenticated;

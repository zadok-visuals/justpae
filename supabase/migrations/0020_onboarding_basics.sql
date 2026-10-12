-- ============================================================================
-- justpae 0020 — quick onboarding writes phone and account type, and nothing
-- else.
--
-- WHY A FUNCTION AT ALL
--
-- Onboarding now has two stages. Stage one asks two questions — "individual or
-- business?" and "what's your phone number?" — and sends the user to their
-- dashboard. Stage two, the actual ID submission, happens later and on the
-- user's own schedule.
--
-- Stage one needs to write profiles.kyc_type. 0011 revoked `update` on profiles
-- table-wide and re-granted it on `phone` ALONE, and added a trigger that
-- raises on any end-user write to kyc_type. Both of those are exactly right and
-- neither is touched here: kyc_type decides which document set a reviewer is
-- shown, so a user picking it directly is a user choosing their own review
-- path.
--
-- So stage one goes through the service role, like submit_kyc_profile does,
-- with p_user_id taken from a verified session.
--
-- WHY NOT JUST REUSE submit_kyc_profile
--
-- Because that function unconditionally sets kyc_status = 'pending', which is
-- the whole point of it. Stage one has submitted nothing — there are no
-- documents to review — and reporting it as "in review" would put the user in
-- front of a banner saying we are checking details they have not sent, and put
-- an empty row in the admin review queue. kyc_status stays 'not_started' here,
-- and this function never writes that column at all.
-- ============================================================================

create function save_onboarding_basics(
  p_user_id uuid,
  p_kyc_type kyc_type,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status kyc_status;
  v_existing_type kyc_type;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'Phone number is required';
  end if;

  select kyc_status, kyc_type into v_status, v_existing_type
  from profiles
  where id = p_user_id
  for update;

  if v_status is null then
    raise exception 'Profile not found';
  end if;

  -- Once documents are in review or approved, the account type is settled. A
  -- flip here would leave a reviewed individual submission sitting under a
  -- profile claiming to be a business (and the reverse), with the documents
  -- orphaned against the wrong tier. The same reasoning the page-level guards
  -- use, enforced where it cannot be routed around.
  if v_status in ('pending', 'approved')
     and v_existing_type is not null
     and v_existing_type is distinct from p_kyc_type then
    raise exception 'Your account type cannot be changed while your identity check is in review or approved.';
  end if;

  -- kyc_status and kyc_rejection_reason are deliberately absent from this
  -- statement. A rejected user redoing stage one keeps their rejection reason
  -- on screen, which is the only thing telling them what to fix.
  update profiles
  set phone = btrim(p_phone),
      kyc_type = p_kyc_type
  where id = p_user_id;
end;
$$;

-- Called with the service role only, exactly as submit_kyc_profile is. Postgres
-- grants EXECUTE to PUBLIC on a new function by default, so this revoke is what
-- keeps assert_phase1_invariants' allowlist both unchanged and true.
revoke execute on function save_onboarding_basics(uuid, kyc_type, text)
  from public, anon, authenticated;

-- Re-assert. This file adds a function, which is precisely the change the 0014
-- invariants exist to police: a new function left callable by a user session is
-- how the self-approval hole would come back.
do $$
begin
  perform assert_phase1_invariants();
  perform assert_phase3_invariants();
  perform assert_phase4_invariants();
  raise notice 'Phase 1, 3 and 4 invariants hold after 0020.';
end;
$$;

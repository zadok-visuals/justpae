-- ============================================================================
-- justpae 0028 — when the review queue was actually joined.
--
-- Split out of 0027 rather than appended to it: 0027 had already been applied
-- to the linked project, and editing an applied migration leaves the file and
-- the database saying different things with nothing in the tooling to notice.
-- ============================================================================
--
-- The KYC queue showed a "Submitted" date that was `profiles.created_at` —
-- when the ACCOUNT was made. For a user who signed up in January and
-- submitted their documents in June, the reviewer was shown January, and the
-- queue's whole purpose is to work oldest-submission-first. The column it
-- needed did not exist, so the nearest one was used and mislabelled.
--
-- WHY NOT DERIVE IT FROM kyc_documents. Tempting — the newest document's
-- created_at is close to the submission time — but it is wrong in both
-- directions. A resubmission reuses document rows that 0015 flips back to
-- pending without rewriting created_at, so a resubmitted application would
-- show its ORIGINAL date and sort to the front of the queue forever. And a
-- submission whose documents all failed to upload has no rows at all.
--
-- BACKFILL. Existing pending applications get created_at — the same figure
-- the screen was already showing, so nothing gets worse — and everyone else
-- gets null, which the page renders as "not submitted" rather than as a
-- fabricated date. Inventing a submission time for an account that never
-- submitted would be the mislabelling this migration exists to fix, in a new
-- place.

alter table profiles add column if not exists kyc_submitted_at timestamptz;

update profiles
set kyc_submitted_at = created_at
where kyc_status in ('pending', 'approved', 'rejected') and kyc_submitted_at is null;

-- The queue reads pending applications oldest-first.
create index if not exists profiles_kyc_pending_idx
  on profiles (kyc_submitted_at)
  where kyc_status = 'pending';

-- 0011 locks the KYC columns against a user session writing them directly;
-- this column is written only here, in the same security-definer function
-- that sets kyc_status, so it cannot disagree with the status it dates.
-- The three defaults are 0011's and have to be repeated verbatim: `create or
-- replace` cannot remove a parameter default from an existing function, and
-- omitting them is removing them.
create or replace function submit_kyc_profile(
  p_user_id uuid,
  p_kyc_type kyc_type,
  p_full_name text default null,
  p_phone text default null,
  p_business_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status kyc_status;
  v_current_name text;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select kyc_status, full_name into v_current_status, v_current_name
  from profiles where id = p_user_id
  for update;

  if v_current_status is null then
    raise exception 'Profile not found';
  end if;

  if v_current_status = 'approved' then
    raise exception 'Your identity check is already approved.';
  end if;

  update profiles
  set
    -- A resubmission while already in review must not quietly rename the
    -- account: full_name is what set_withdrawal_recipient matches a payout
    -- account holder against.
    full_name = case
      when p_full_name is null then full_name
      when v_current_status = 'pending' and v_current_name is not null then v_current_name
      else p_full_name
    end,
    phone = coalesce(p_phone, phone),
    business_name = coalesce(p_business_name, business_name),
    kyc_type = p_kyc_type,
    kyc_status = 'pending',
    kyc_rejection_reason = null,
    -- Every submission redates the queue entry, including a resubmission
    -- after a rejection. That is the correct behaviour for a queue worked
    -- oldest-first: a rejected application that has just been corrected has
    -- been waiting since the correction, not since the original attempt, and
    -- keeping the original date would park it permanently at the front.
    kyc_submitted_at = now()
  where id = p_user_id;

  -- Every document row back to pending, in the same transaction. Resubmitting
  -- means "look at all of this again" — including the parts that were not
  -- changed, since the reviewer rejected the set as a whole.
  update kyc_documents
  set status = 'pending'
  where user_id = p_user_id and status <> 'pending';
end;
$$;

revoke execute on function submit_kyc_profile(uuid, kyc_type, text, text, text)
  from public, anon, authenticated;


-- Everything above is read-side or additive. Re-running the standing
-- assertion costs nothing and proves no grant widened.
do $$
begin
  perform assert_phase1_invariants();
end;
$$;

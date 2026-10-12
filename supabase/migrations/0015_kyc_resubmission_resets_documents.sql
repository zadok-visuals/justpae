-- ============================================================================
-- justpae 0015 — a partial resubmission must not leave half the documents
-- marked rejected.
--
-- THE BUG. admin_reject_kyc (0007) sets status = 'rejected' on EVERY pending
-- document row for the user, which is right — the whole submission was
-- rejected. But a resubmission only upserts the document types the user
-- actually re-supplied. Change the ID photo and leave the phone number alone,
-- and the phone_number row stays at 'rejected' next to a freshly 'pending'
-- id_document. A reviewer opening that account sees a half-rejected set with
-- nothing to say which state is current, and the natural reading — "this was
-- rejected" — is wrong.
--
-- WHY IT GOES HERE AND NOT IN THE SERVER ACTION. The obvious fix is for the
-- action to bulk-update the sibling rows from the user's own session. It
-- cannot: 0011 revoked `status` from the user's column grants precisely so a
-- user can never choose a document status. Granting it back and relying on the
-- forcing trigger to overwrite the value would work, but it would also mean
-- the invariant assertion in 0014 ("no user session holds UPDATE on
-- kyc_documents.status") no longer holds, and that assertion is worth more than
-- the convenience.
--
-- So the reset moves into submit_kyc_profile, which already runs with the
-- service role and already knows the user. It also becomes atomic with the
-- profile flip to 'pending', which is what it should always have been: the two
-- facts "this submission is pending review" and "these documents are pending
-- review" cannot be allowed to disagree.
-- ============================================================================

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
    kyc_rejection_reason = null
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

-- The grants and policies 0014 asserts are unchanged by this file, but
-- re-running the assertion costs nothing and proves it.
do $$
begin
  perform assert_phase1_invariants();
end;
$$;

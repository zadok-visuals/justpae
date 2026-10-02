-- ============================================================================
-- justpae 0007 — admin KYC review.
--
-- Nothing else transitions kyc_status: a user's own submission always sets
-- 'pending', and only these two functions move it to approved/rejected.
--
-- Admin identity is NOT a database role here — it is an email allowlist in
-- ADMIN_EMAILS checked by src/lib/auth/admin.ts at the top of every admin page
-- AND every admin server action (an action is reachable by POST regardless of
-- whether the page that renders it was gated). These functions are therefore
-- only ever reached through the service-role client from an already-gated
-- action, and are revoked from every other role.
-- ============================================================================

create function admin_approve_kyc(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set kyc_status = 'approved', kyc_rejection_reason = null
  where id = p_user_id;

  update kyc_documents
  set status = 'approved'
  where user_id = p_user_id and status = 'pending';
end;
$$;

revoke execute on function admin_approve_kyc(uuid) from public, anon, authenticated;

-- The reason is required, not optional: without it the user-facing status page
-- can only show a generic "please review and resubmit", which tells them
-- nothing about what was actually wrong and guarantees a second rejection.
create function admin_reject_kyc(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A rejection reason is required';
  end if;

  update profiles
  set kyc_status = 'rejected', kyc_rejection_reason = p_reason
  where id = p_user_id;

  update kyc_documents
  set status = 'rejected'
  where user_id = p_user_id and status = 'pending';
end;
$$;

revoke execute on function admin_reject_kyc(uuid, text) from public, anon, authenticated;

-- ============================================================================
-- justpae 0011 — a user cannot approve their own identity check.
--
-- WHAT WAS WRONG
--
-- 0001 created exactly one update policy on profiles:
--
--   create policy "profiles: update own" on profiles for update using (auth.uid() = id);
--
-- An RLS policy says WHICH ROWS may be updated. It says nothing about which
-- COLUMNS. With `update` granted to `authenticated` on the whole table (the
-- Supabase default), that policy let a user PATCH their own profile row with
-- kyc_status = 'approved' from their own session, and every KYC gate in the
-- product is a read of that column:
--
--   create_withdrawal_request    refuses unless kyc_status = 'approved'
--   /withdraw, /onboarding       route on it
--
-- …so one PATCH against /rest/v1/profiles promoted an unverified account to a
-- fully withdrawal-enabled one. kyc_type, kyc_rejection_reason, email and
-- country were writable the same way; email in particular is read back as an
-- identity in places where a forged value is worse than a wrong one.
--
-- kyc_documents had the matching hole: "insert own" and "update own" with a
-- `status` column defaulting to 'pending', so a user could insert their own
-- document rows already marked 'approved' and present a reviewer with a
-- pre-approved file set.
--
-- THE FIX — three layers, because any one of them alone has a gap:
--
--   1. COLUMN GRANTS. `update` is revoked table-wide and re-granted on exactly
--      the columns a user legitimately edits. This is the layer that actually
--      stops the PATCH above, and it stops it in the privilege system, before
--      any policy or trigger runs.
--   2. A BEFORE UPDATE TRIGGER. Column grants are easy to widen by accident in
--      a later migration (`grant update on profiles to authenticated` is one
--      careless line). The trigger raises regardless of how the write arrived,
--      as long as it arrived as an end-user request.
--   3. A SERVICE-ROLE WRITE PATH. The KYC submit flow genuinely needs to set
--      kyc_status = 'pending' and kyc_type. It now does that through
--      submit_kyc_profile, called with the service role and the user id taken
--      from the verified session — not from the user's own connection.
-- ============================================================================

-- ── How "is this an end-user request?" is decided ───────────────────────────
-- Two independent signals, because each covers a case the other misses:
--
--   current_user — PostgREST does `set local role authenticated` (or `anon`)
--     for an end-user request and `set local role service_role` for a
--     service-role one. Inside a SECURITY DEFINER function owned by postgres,
--     current_user is postgres. So this signal correctly trusts migrations,
--     psql, and our own definer functions, and distrusts a direct PATCH.
--     The trigger function is therefore deliberately NOT security definer —
--     making it one would collapse current_user to its owner every time and
--     destroy the signal.
--
--   the JWT's role claim — covers the case where a SECURITY DEFINER function
--     is (now or later) granted to `authenticated` and writes profiles: there
--     current_user is postgres, but the request is still an end-user one.
--
-- Trusted unless either signal says end-user. A connection with no JWT claims
-- at all is a direct database connection (migration, psql, pg_cron) and is
-- trusted — that is what lets this very migration, and every admin_* definer
-- function invoked with the service role, keep working.
create function is_end_user_request()
returns boolean
language plpgsql
stable
as $$
declare
  v_claims text;
  v_role text;
begin
  if current_user in ('authenticated', 'anon') then
    return true;
  end if;

  v_claims := nullif(current_setting('request.jwt.claims', true), '');
  if v_claims is null then
    -- No PostgREST request context: a direct connection. Trusted.
    return false;
  end if;

  v_role := v_claims::jsonb ->> 'role';
  -- A claims blob with no role is NOT given the benefit of the doubt.
  return v_role is null or v_role in ('authenticated', 'anon');
exception
  -- An unparseable claims blob is treated as untrusted rather than ignored.
  when others then
    return true;
end;
$$;

grant execute on function is_end_user_request() to authenticated, anon;

-- ── profiles: column grants ─────────────────────────────────────────────────
-- `phone` is the only column a user edits about themselves outside the KYC
-- flow. full_name, business_name, kyc_type and kyc_status are all set by
-- submit_kyc_profile below; email and country are set once at signup by
-- handle_new_user and are identity, not preferences.
revoke update on profiles from authenticated;
revoke update on profiles from anon;
grant update (phone) on profiles to authenticated;

-- ── profiles: the trigger ───────────────────────────────────────────────────
create function profiles_guard_protected_columns()
returns trigger
language plpgsql
as $$
begin
  if not is_end_user_request() then
    return new;
  end if;

  if new.kyc_status is distinct from old.kyc_status then
    raise exception 'kyc_status cannot be changed from a user session';
  end if;

  if new.kyc_type is distinct from old.kyc_type then
    raise exception 'kyc_type cannot be changed from a user session';
  end if;

  if new.kyc_rejection_reason is distinct from old.kyc_rejection_reason then
    raise exception 'kyc_rejection_reason cannot be changed from a user session';
  end if;

  if new.email is distinct from old.email then
    raise exception 'email cannot be changed from a user session';
  end if;

  if new.country is distinct from old.country then
    raise exception 'country cannot be changed from a user session';
  end if;

  if new.id is distinct from old.id then
    raise exception 'id cannot be changed';
  end if;

  -- full_name is load-bearing beyond display: set_withdrawal_recipient and
  -- confirm_recipient_change both compare the payout account holder name
  -- against it, and that comparison is the only thing stopping a payout to a
  -- third party. Once a submission is in review or approved, the name is the
  -- name on the reviewed ID and is frozen.
  if new.full_name is distinct from old.full_name
     and old.kyc_status in ('pending', 'approved') then
    raise exception 'Your name is locked while your identity check is in review or approved. Contact support to change it.';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_protected_columns
  before update on profiles
  for each row execute function profiles_guard_protected_columns();

-- ── kyc_documents: never self-approved ──────────────────────────────────────
-- A user legitimately inserts and REPLACES their own documents: resubmitting
-- after a rejection has to overwrite the previous row for that document type
-- (that is what the unique constraint on (user_id, document_type) is for).
-- What they must never do is choose the status.
--
-- Column grants stop `status` arriving in the payload at all; the trigger then
-- forces it to 'pending' no matter how the write got here, which is also the
-- correct semantics — touching a document always means "look at this again".
revoke insert, update on kyc_documents from authenticated;
revoke insert, update on kyc_documents from anon;
grant insert (user_id, tier, document_type, file_ref, value) on kyc_documents to authenticated;
grant update (tier, document_type, file_ref, value) on kyc_documents to authenticated;

create function kyc_documents_force_pending_status()
returns trigger
language plpgsql
as $$
begin
  if not is_end_user_request() then
    return new;
  end if;

  -- Not an exception: forcing the value is both safe and the behaviour the
  -- resubmission flow wants, and raising here would turn a harmless redundant
  -- field in a payload into a failed submission.
  new.status := 'pending';
  return new;
end;
$$;

create trigger kyc_documents_force_pending_status
  before insert or update on kyc_documents
  for each row execute function kyc_documents_force_pending_status();

-- ── submit_kyc_profile — the legitimate server-side write ──────────────────
-- Called with the service role from src/lib/actions/kyc.ts, with p_user_id
-- taken from supabase.auth.getUser(). This is the ONLY way kyc_status reaches
-- 'pending', and it can only ever reach 'pending' — never 'approved'. Approval
-- stays where it already was, in admin_approve_kyc.
create function submit_kyc_profile(
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
    -- The same freeze the trigger enforces, applied here too: a resubmission
    -- while already in review must not quietly rename the account.
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
end;
$$;

revoke execute on function submit_kyc_profile(uuid, kyc_type, text, text, text)
  from public, anon, authenticated;

-- ============================================================================
-- justpae 0035 — one column: whether a user wants general-announcement email.
--
-- SCOPE, DELIBERATELY NARROW. This controls ONLY the admin broadcast/targeted
-- notice sent from NotificationComposer (src/lib/actions/notifications.ts).
-- It does not and must not gate account or security email — a PIN lock, a
-- withdrawal receipt, a KYC decision, a payout-recipient change. Those are
-- not announcements; they are the record of something that happened to the
-- user's own money, and opting out of "tell me about new features" is not
-- the same decision as opting out of "tell me my withdrawal failed".
--
-- Defaults true: this is an opt-OUT preference for people already using the
-- product, not a marketing opt-in gate.
-- ============================================================================

alter table profiles
  add column email_announcements boolean not null default true;

-- Same shape as 0011's `grant update (phone)`: row-level RLS already limits
-- this to auth.uid() = id, and the column grant is what lets a user flip
-- their own flag without reopening the table-wide write 0011 revoked.
grant update (email_announcements) on profiles to authenticated;

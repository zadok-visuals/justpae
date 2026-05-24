-- Secure Unrestricted Tables

-- 1. Secure supported_cryptos
ALTER TABLE public.supported_cryptos ENABLE ROW LEVEL SECURITY;

-- Allow anyone (or authenticated users) to read supported cryptos so the app can list them
CREATE POLICY "Allow public read access to supported_cryptos" 
ON public.supported_cryptos 
FOR SELECT 
USING (true);

-- 2. Secure system_accounts
ALTER TABLE public.system_accounts ENABLE ROW LEVEL SECURITY;

-- Only admins should ideally see this, but it's safe to just restrict it entirely 
-- since our functions use SECURITY DEFINER and bypass RLS to read it.
-- We'll add a read-only policy for authenticated users just in case they need to query it.
CREATE POLICY "Allow authenticated read access to system_accounts" 
ON public.system_accounts 
FOR SELECT 
TO authenticated
USING (true);

-- 3. Secure wallet_balances_view
-- In Supabase/PostgreSQL, to make a view respect the RLS of its underlying tables 
-- and remove the "UNRESTRICTED" warning, we recreate it with security_invoker = on.
-- Since the underlying table (ledger_entries) already has an RLS policy restricting 
-- users to only see their own entries, this view will now securely return only the 
-- current user's balance without leaking other users' balances.

DROP VIEW IF EXISTS public.wallet_balances_view;

CREATE VIEW public.wallet_balances_view WITH (security_invoker = on) AS
SELECT 
    user_id,
    COALESCE(SUM(CASE WHEN entry_type = 'credit' AND clears_at <= NOW() THEN amount ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0) AS available_balance,
    COALESCE(SUM(CASE WHEN entry_type = 'credit' AND clears_at > NOW() THEN amount ELSE 0 END), 0) AS pending_balance
FROM public.ledger_entries
WHERE account_type = 'user'
GROUP BY user_id;

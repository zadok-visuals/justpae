-- Fix wallet RLS policies so users can manage their own wallet rows
-- and ensure wallets table has proper RLS enabled

-- Enable RLS (idempotent)
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Drop any old policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own wallets" ON public.wallets;
DROP POLICY IF EXISTS "Users can insert own wallets" ON public.wallets;
DROP POLICY IF EXISTS "Users can update own wallets" ON public.wallets;
DROP POLICY IF EXISTS "Admins can view all wallets" ON public.wallets;
DROP POLICY IF EXISTS "Admins can update all wallets" ON public.wallets;

-- Users can read their own wallet
CREATE POLICY "Users can view own wallets"
  ON public.wallets
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own wallet row (needed on first deposit)
CREATE POLICY "Users can insert own wallets"
  ON public.wallets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own wallet balance
CREATE POLICY "Users can update own wallets"
  ON public.wallets
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all wallets
CREATE POLICY "Admins can view all wallets"
  ON public.wallets
  FOR SELECT
  USING (public.is_admin_safe(auth.uid()));

-- Admins can update all wallets (e.g. manual adjustments)
CREATE POLICY "Admins can update all wallets"
  ON public.wallets
  FOR UPDATE
  USING (public.is_admin_safe(auth.uid()));

-- Also fix transactions table RLS if missing
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can update all transactions" ON public.transactions;

CREATE POLICY "Users can view own transactions"
  ON public.transactions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions"
  ON public.transactions
  FOR SELECT
  USING (public.is_admin_safe(auth.uid()));

CREATE POLICY "Admins can update all transactions"
  ON public.transactions
  FOR UPDATE
  USING (public.is_admin_safe(auth.uid()));

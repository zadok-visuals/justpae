-- Migration to sync profile columns and fix admin query errors
DO $$ 
BEGIN
    -- Ensure is_kyc_verified exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_kyc_verified') THEN
        ALTER TABLE public.profiles ADD COLUMN is_kyc_verified BOOLEAN DEFAULT FALSE;
    END IF;

    -- Ensure full_name exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'full_name') THEN
        ALTER TABLE public.profiles ADD COLUMN full_name TEXT;
    END IF;

    -- Ensure name exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'name') THEN
        ALTER TABLE public.profiles ADD COLUMN name TEXT;
    END IF;

    -- Sync name and full_name
    UPDATE public.profiles SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL;
    UPDATE public.profiles SET name = full_name WHERE name IS NULL AND full_name IS NOT NULL;
END $$;

-- Fix the is_admin_safe RPC function (prevents ERR_CONNECTION_CLOSED/404)
CREATE OR REPLACE FUNCTION public.is_admin_safe(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = user_uuid AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CRITICAL: Allow Admins to see all profiles (Fixes "only 1 user showing" issue)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Ensure other tables also allow admin view if needed
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions" 
ON public.transactions 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() AND is_active = true
  )
);


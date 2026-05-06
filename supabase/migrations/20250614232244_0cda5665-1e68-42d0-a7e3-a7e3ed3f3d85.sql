
-- Step 1: Drop the function if it exists, to allow for its recreation.
DROP FUNCTION IF EXISTS public.get_current_admin_role();

-- Step 2: Drop all existing RLS policies on 'admin_users' to remove the recursion source.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'admin_users' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.admin_users;';
    END LOOP;
END $$;

-- Step 3: Create the 'admin_role' ENUM type if it's missing.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
        CREATE TYPE public.admin_role AS ENUM ('super_admin', 'admin', 'moderator');
    END IF;
END$$;

-- Step 4: Recreate the security definer function with explicit schema qualification for the custom type.
CREATE OR REPLACE FUNCTION public.get_current_admin_role()
RETURNS public.admin_role -- Explicitly schema-qualified
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.admin_role; -- Explicitly schema-qualified
BEGIN
  -- This query runs with function owner's permissions, avoiding RLS recursion.
  SELECT au.admin_role
  INTO v_role
  FROM public.admin_users AS au
  WHERE au.user_id = auth.uid() AND au.is_active = true;
  
  RETURN v_role;
END;
$$;

-- Step 5: Re-apply correct RLS policies on 'admin_users'.

-- Policy to allow an admin to see their own record.
CREATE POLICY "Admins can view their own user data"
ON public.admin_users FOR SELECT
USING (auth.uid() = user_id);

-- Policy to allow 'super_admin' role full access to all admin user records.
CREATE POLICY "Super admins have full access to admin users"
ON public.admin_users FOR ALL
USING (public.get_current_admin_role() = 'super_admin')
WITH CHECK (public.get_current_admin_role() = 'super_admin');

-- Migration to sync profile columns and fix admin query errors
-- This script ensures the profiles table has consistent column naming (name and full_name)
-- and adds missing columns required by the admin analytics and chat systems.

DO $$ 
BEGIN
    -- Ensure is_kyc_verified exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_kyc_verified') THEN
        ALTER TABLE public.profiles ADD COLUMN is_kyc_verified BOOLEAN DEFAULT FALSE;
    END IF;

    -- Ensure full_name exists (some parts of the app use full_name)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'full_name') THEN
        ALTER TABLE public.profiles ADD COLUMN full_name TEXT;
    END IF;

    -- Ensure name exists (admin analytics uses name)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'name') THEN
        ALTER TABLE public.profiles ADD COLUMN name TEXT;
    END IF;

    -- Sync name and full_name if one is missing
    UPDATE public.profiles SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL;
    UPDATE public.profiles SET name = full_name WHERE name IS NULL AND full_name IS NOT NULL;

END $$;

-- Update RLS or other constraints if needed
-- (Assuming standard RLS policies are already in place for profiles)

-- Migration to add simplified KYC columns to profiles
DO $$ 
BEGIN
    -- Add phone number for KYC
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'kyc_phone_number') THEN
        ALTER TABLE public.profiles ADD COLUMN kyc_phone_number TEXT;
    END IF;

    -- Add proof of address URL
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'kyc_address_proof_url') THEN
        ALTER TABLE public.profiles ADD COLUMN kyc_address_proof_url TEXT;
    END IF;

    -- Add KYC submission timestamp
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'kyc_submitted_at') THEN
        ALTER TABLE public.profiles ADD COLUMN kyc_submitted_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

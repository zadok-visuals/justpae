
-- Create the custom 'admin_role' type if it does not already exist.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
        CREATE TYPE public.admin_role AS ENUM ('super_admin', 'admin', 'moderator');
    END IF;
END$$;

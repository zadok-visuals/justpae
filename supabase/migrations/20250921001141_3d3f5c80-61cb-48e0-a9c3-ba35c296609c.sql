-- Security Fix: Update verify_admin_credentials function with explicit search path

CREATE OR REPLACE FUNCTION public.verify_admin_credentials(p_user_id uuid, p_admin_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  stored_admin_password text;
  user_is_admin boolean;
  setting_exists boolean;
BEGIN
  -- This function runs with elevated privileges, bypassing user-specific RLS policies.

  -- First, ensure the admin password setting exists.
  SELECT EXISTS (
    SELECT 1 FROM system_settings WHERE setting_key = 'admin_password'
  ) INTO setting_exists;

  IF NOT setting_exists THEN
    INSERT INTO system_settings (setting_key, setting_value, description)
    VALUES ('admin_password', 'Admin123', 'Admin access password');
  END IF;

  -- Get the stored admin password from system_settings.
  SELECT setting_value INTO stored_admin_password
  FROM system_settings
  WHERE setting_key = 'admin_password'
  LIMIT 1;

  IF stored_admin_password IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to verify admin access: configuration error');
  END IF;

  -- Compare the provided password with the stored password.
  IF p_admin_password <> stored_admin_password THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid admin credentials');
  END IF;

  -- Verify that the user exists in the admin_users table and is active.
  SELECT EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = p_user_id AND is_active = true
  ) INTO user_is_admin;

  IF NOT user_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not an active admin');
  END IF;

  -- If all checks pass, return success.
  RETURN jsonb_build_object('success', true);
END;
$$;
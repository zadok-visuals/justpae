
-- Stricter admin credential verification
CREATE OR REPLACE FUNCTION public.verify_admin_credentials(p_user_id uuid, p_admin_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Corrected permanent feedback deletion function
CREATE OR REPLACE FUNCTION delete_feedback_permanently(
  feedback_id uuid,
  admin_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify admin status using the safe checker function
  IF NOT public.is_admin_safe(admin_user_id) THEN
    RAISE EXCEPTION 'Access denied: User is not an active admin';
  END IF;
  
  -- Delete the feedback
  DELETE FROM user_feedback WHERE id = feedback_id;
  
  -- Log the admin action
  INSERT INTO admin_actions (
    admin_user_id,
    action_type,
    details,
    target_id
  ) VALUES (
    admin_user_id,
    'delete_feedback',
    jsonb_build_object('feedback_id', feedback_id),
    feedback_id
  );
  
  RETURN true;
END;
$$;

-- Corrected permanent transaction deletion function
CREATE OR REPLACE FUNCTION delete_transaction_permanently(
  transaction_id uuid,
  admin_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify admin status using the safe checker function
  IF NOT public.is_admin_safe(admin_user_id) THEN
    RAISE EXCEPTION 'Access denied: User is not an active admin';
  END IF;
  
  -- Delete the transaction
  DELETE FROM transactions WHERE id = transaction_id;
  
  -- Log the admin action
  INSERT INTO admin_actions (
    admin_user_id,
    action_type,
    details,
    target_id
  ) VALUES (
    admin_user_id,
    'delete_transaction',
    jsonb_build_object('transaction_id', transaction_id),
    transaction_id
  );
  
  RETURN true;
END;
$$;

-- Security Fix: Update final batch of functions with explicit search paths

CREATE OR REPLACE FUNCTION public.log_admin_activity(admin_id uuid, action_type text, activity_details jsonb DEFAULT '{}'::jsonb, client_ip text DEFAULT 'unknown'::text, client_user_agent text DEFAULT 'unknown'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO admin_actions (
    admin_user_id,
    action_type,
    details,
    created_at
  ) VALUES (
    admin_id,
    action_type,
    activity_details || jsonb_build_object(
      'ip_address', client_ip,
      'user_agent', client_user_agent
    ),
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_feedback_permanently(feedback_id uuid, admin_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_users_id uuid;
BEGIN
  IF NOT public.is_admin_safe(admin_user_id) THEN
    RAISE EXCEPTION 'Access denied: User is not an active admin';
  END IF;
  
  SELECT id INTO v_admin_users_id FROM public.admin_users WHERE user_id = admin_user_id;
  
  IF v_admin_users_id IS NULL THEN
    RAISE EXCEPTION 'Admin user record not found';
  END IF;

  DELETE FROM public.user_feedback WHERE id = feedback_id;
  
  INSERT INTO public.admin_actions (
    admin_user_id,
    action_type,
    details,
    target_id
  ) VALUES (
    v_admin_users_id,
    'delete_feedback',
    jsonb_build_object('feedback_id', feedback_id),
    feedback_id
  );
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_transaction_permanently(transaction_id uuid, admin_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_users_id uuid;
BEGIN
  IF NOT public.is_admin_safe(admin_user_id) THEN
    RAISE EXCEPTION 'Access denied: User is not an active admin';
  END IF;
  
  SELECT id INTO v_admin_users_id FROM public.admin_users WHERE user_id = admin_user_id;

  IF v_admin_users_id IS NULL THEN
    RAISE EXCEPTION 'Admin user record not found';
  END IF;

  DELETE FROM public.transactions WHERE id = transaction_id;
  
  INSERT INTO public.admin_actions (
    admin_user_id,
    action_type,
    details,
    target_id
  ) VALUES (
    v_admin_users_id,
    'delete_transaction',
    jsonb_build_object('transaction_id', transaction_id),
    transaction_id
  );
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_completely(user_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_uuid UUID;
  deletion_summary JSONB := '{}';
  transaction_count INTEGER;
  wallet_count INTEGER;
  profile_exists BOOLEAN;
BEGIN
  -- Find user by email in profiles table
  SELECT id INTO user_uuid FROM profiles WHERE email = user_email;
  
  IF user_uuid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Count related records before deletion
  SELECT COUNT(*) INTO transaction_count FROM transactions WHERE user_id = user_uuid;
  SELECT COUNT(*) INTO wallet_count FROM wallets WHERE user_id = user_uuid;
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = user_uuid) INTO profile_exists;
  
  -- Delete related records in order (respecting foreign key constraints)
  DELETE FROM admin_sessions WHERE admin_user_id = user_uuid;
  DELETE FROM admin_users WHERE user_id = user_uuid;
  DELETE FROM admin_actions WHERE admin_user_id = user_uuid OR target_user_id = user_uuid;
  DELETE FROM bank_accounts WHERE user_id = user_uuid;
  DELETE FROM crypto_holdings WHERE user_id = user_uuid;
  DELETE FROM crypto_wallet_addresses WHERE user_id = user_uuid;
  DELETE FROM crypto_deposits WHERE user_id = user_uuid;
  DELETE FROM notifications WHERE user_id = user_uuid;
  DELETE FROM payment_methods WHERE user_id = user_uuid;
  DELETE FROM transactions WHERE user_id = user_uuid;
  DELETE FROM wallets WHERE user_id = user_uuid;
  DELETE FROM profiles WHERE id = user_uuid;
  
  -- Note: auth.users is managed by Supabase and requires admin API to delete
  
  deletion_summary := jsonb_build_object(
    'success', true,
    'user_id', user_uuid,
    'email', user_email,
    'deleted_transactions', transaction_count,
    'deleted_wallets', wallet_count,
    'profile_existed', profile_exists,
    'note', 'User deleted from application tables. Auth user must be deleted from Supabase Auth admin panel.'
  );
  
  RETURN deletion_summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_system_setting(p_setting_key text, p_setting_value text, p_admin_user_id uuid, p_setting_description text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_users_id uuid;
BEGIN
  IF NOT public.is_admin_safe(p_admin_user_id) THEN
    RAISE EXCEPTION 'Access denied: User is not an active admin';
  END IF;

  -- Look up the id from the admin_users table
  SELECT id INTO v_admin_users_id FROM public.admin_users WHERE user_id = p_admin_user_id;
  
  IF v_admin_users_id IS NULL THEN
    RAISE EXCEPTION 'Admin user record not found';
  END IF;
  
  INSERT INTO public.system_settings (
    setting_key,
    setting_value,
    description,
    updated_by
  ) VALUES (
    p_setting_key,
    p_setting_value,
    COALESCE(p_setting_description, ''),
    v_admin_users_id -- Use the correct admin_users.id
  )
  ON CONFLICT (setting_key) 
  DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    description = COALESCE(EXCLUDED.description, system_settings.description),
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
  
  INSERT INTO public.admin_actions (
    admin_user_id,
    action_type,
    details
  ) VALUES (
    v_admin_users_id, -- Use the correct admin_users.id
    'update_system_setting',
    jsonb_build_object(
      'setting_key', p_setting_key,
      'setting_value', p_setting_value
    )
  );
  
  RETURN true;
END;
$$;
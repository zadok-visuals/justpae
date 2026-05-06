
-- Drop existing functions before recreating them to avoid parameter name conflicts
DROP FUNCTION IF EXISTS public.delete_feedback_permanently(uuid, uuid);
DROP FUNCTION IF EXISTS public.delete_transaction_permanently(uuid, uuid);
DROP FUNCTION IF EXISTS public.update_system_setting(text, text, uuid, text);

-- Corrected permanent feedback deletion function
CREATE OR REPLACE FUNCTION public.delete_feedback_permanently(
  feedback_id uuid,
  p_admin_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_users_id uuid;
BEGIN
  IF NOT public.is_admin_safe(p_admin_user_id) THEN
    RAISE EXCEPTION 'Access denied: User is not an active admin';
  END IF;
  
  -- Look up the id from the admin_users table, not auth.users
  SELECT id INTO v_admin_users_id FROM public.admin_users WHERE user_id = p_admin_user_id;
  
  IF v_admin_users_id IS NULL THEN
    RAISE EXCEPTION 'Admin user record not found';
  END IF;

  DELETE FROM public.user_feedback WHERE id = feedback_id;
  
  -- Use the correct admin_users.id for logging
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

-- Corrected permanent transaction deletion function
CREATE OR REPLACE FUNCTION public.delete_transaction_permanently(
  transaction_id uuid,
  p_admin_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

  DELETE FROM public.transactions WHERE id = transaction_id;
  
  -- Use the correct admin_users.id for logging
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

-- Corrected system setting update function
CREATE OR REPLACE FUNCTION public.update_system_setting(
  p_setting_key text, 
  p_setting_value text, 
  p_admin_user_id uuid, 
  p_setting_description text DEFAULT NULL
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
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


-- Drop existing functions to be recreated with correct parameter names
DROP FUNCTION IF EXISTS public.delete_feedback_permanently(uuid, uuid);
DROP FUNCTION IF EXISTS public.delete_transaction_permanently(uuid, uuid);

-- Recreate permanent feedback deletion function with correct parameter names
CREATE OR REPLACE FUNCTION public.delete_feedback_permanently(
  feedback_id uuid,
  admin_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Recreate permanent transaction deletion function with correct parameter names
CREATE OR REPLACE FUNCTION public.delete_transaction_permanently(
  transaction_id uuid,
  admin_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

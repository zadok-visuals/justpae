-- Critical Security Fix 1: Remove private keys from database
-- Private keys should never be stored in user-accessible database tables
ALTER TABLE public.crypto_wallet_addresses 
DROP COLUMN IF EXISTS private_key_encrypted;

-- Critical Security Fix 2: Harden database function security with explicit search paths
-- Update all existing functions to use explicit search_path for security

CREATE OR REPLACE FUNCTION public.get_current_admin_role()
RETURNS admin_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_role public.admin_role;
BEGIN
  SELECT au.admin_role
  INTO v_role
  FROM public.admin_users AS au
  WHERE au.user_id = auth.uid() AND au.is_active = true;
  
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_safe(user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = user_uuid AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_admin_role(user_uuid uuid)
RETURNS admin_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT admin_role FROM public.admin_users 
  WHERE user_id = user_uuid AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT public.is_admin_safe(user_uuid);
$$;

-- Security Fix 3: Add field-level encryption functions for sensitive data
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to encrypt sensitive bank account data
CREATE OR REPLACE FUNCTION public.encrypt_sensitive_data(data_to_encrypt text, encryption_key text DEFAULT 'default_key_change_me')
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT encode(encrypt(data_to_encrypt::bytea, encryption_key::bytea, 'aes'::bytea), 'base64');
$$;

-- Function to decrypt sensitive bank account data
CREATE OR REPLACE FUNCTION public.decrypt_sensitive_data(encrypted_data text, encryption_key text DEFAULT 'default_key_change_me')
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT convert_from(decrypt(decode(encrypted_data, 'base64'), encryption_key::bytea, 'aes'::bytea), 'UTF8');
$$;

-- Security Fix 4: Add audit logging for sensitive operations
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action_type text NOT NULL,
  table_name text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super admins can access audit logs
CREATE POLICY "Super admins can view audit logs"
ON public.security_audit_log
FOR SELECT
USING (public.get_current_admin_role() = 'super_admin'::admin_role);

-- System can insert audit logs
CREATE POLICY "System can insert audit logs"
ON public.security_audit_log
FOR INSERT
WITH CHECK (true);

-- Function to log security events
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_user_id uuid,
  p_action_type text,
  p_table_name text DEFAULT NULL,
  p_record_id uuid DEFAULT NULL,
  p_old_values jsonb DEFAULT NULL,
  p_new_values jsonb DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    user_id,
    action_type,
    table_name,
    record_id,
    old_values,
    new_values,
    ip_address,
    user_agent
  ) VALUES (
    p_user_id,
    p_action_type,
    p_table_name,
    p_record_id,
    p_old_values,
    p_new_values,
    p_ip_address,
    p_user_agent
  );
END;
$$;
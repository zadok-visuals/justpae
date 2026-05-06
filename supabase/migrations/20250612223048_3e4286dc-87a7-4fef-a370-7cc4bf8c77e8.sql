
-- Fix the system_settings table to ensure proper maintenance mode functionality
ALTER TABLE system_settings ALTER COLUMN setting_value TYPE text;

-- Create proper indexes for better performance
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);

-- Add RLS policies to ensure admin can manage system settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admin can view system settings" ON system_settings;
DROP POLICY IF EXISTS "Admin can modify system settings" ON system_settings;

-- Create new policies with correct syntax
CREATE POLICY "Admin can view system settings"
ON system_settings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE user_id = auth.uid() AND is_active = true
  )
);

CREATE POLICY "Admin can modify system settings"
ON system_settings FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Ensure proper cascade deletion for transactions
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Ensure proper cascade deletion for user_feedback  
ALTER TABLE user_feedback DROP CONSTRAINT IF EXISTS user_feedback_user_id_fkey;
ALTER TABLE user_feedback ADD CONSTRAINT user_feedback_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Create function to properly delete transactions with admin verification
CREATE OR REPLACE FUNCTION delete_transaction_permanently(
  transaction_id uuid,
  admin_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_admin_active boolean;
BEGIN
  -- Verify admin status
  SELECT is_active INTO is_admin_active 
  FROM admin_users 
  WHERE user_id = admin_user_id;
  
  IF NOT is_admin_active THEN
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

-- Create function to properly delete feedback with admin verification
CREATE OR REPLACE FUNCTION delete_feedback_permanently(
  feedback_id uuid,
  admin_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_admin_active boolean;
BEGIN
  -- Verify admin status
  SELECT is_active INTO is_admin_active 
  FROM admin_users 
  WHERE user_id = admin_user_id;
  
  IF NOT is_admin_active THEN
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

-- Create function to update system settings properly
CREATE OR REPLACE FUNCTION update_system_setting(
  setting_key text,
  setting_value text,
  admin_user_id uuid,
  setting_description text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_admin_active boolean;
BEGIN
  -- Verify admin status
  SELECT is_active INTO is_admin_active 
  FROM admin_users 
  WHERE user_id = admin_user_id;
  
  IF NOT is_admin_active THEN
    RAISE EXCEPTION 'Access denied: User is not an active admin';
  END IF;
  
  -- Insert or update the setting
  INSERT INTO system_settings (
    setting_key,
    setting_value,
    description,
    updated_by
  ) VALUES (
    setting_key,
    setting_value,
    COALESCE(setting_description, ''),
    admin_user_id
  )
  ON CONFLICT (setting_key) 
  DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    description = COALESCE(EXCLUDED.description, system_settings.description),
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
  
  -- Log the admin action
  INSERT INTO admin_actions (
    admin_user_id,
    action_type,
    details
  ) VALUES (
    admin_user_id,
    'update_system_setting',
    jsonb_build_object(
      'setting_key', setting_key,
      'setting_value', setting_value
    )
  );
  
  RETURN true;
END;
$$;

-- Add unique constraint to system_settings (without IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'system_settings_key_unique'
  ) THEN
    ALTER TABLE system_settings ADD CONSTRAINT system_settings_key_unique UNIQUE (setting_key);
  END IF;
END $$;

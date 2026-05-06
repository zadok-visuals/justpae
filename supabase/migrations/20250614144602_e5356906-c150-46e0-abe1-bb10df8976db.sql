
-- Create a table to store user PINs securely
CREATE TABLE public.user_pins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  pin_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on user_pins table
ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

-- Create policies for user_pins
CREATE POLICY "Users can view their own PIN" 
  ON public.user_pins 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own PIN" 
  ON public.user_pins 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own PIN" 
  ON public.user_pins 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own PIN" 
  ON public.user_pins 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Fix admin password system - ensure proper storage
INSERT INTO system_settings (setting_key, setting_value, description) 
VALUES ('admin_password', 'SecureAdmin2024!', 'Admin access password') 
ON CONFLICT (setting_key) 
DO UPDATE SET setting_value = 'SecureAdmin2024!';

-- Create functions for PIN management
CREATE OR REPLACE FUNCTION public.create_user_pin(pin_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid uuid;
  pin_hash text;
BEGIN
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;
  
  -- Check if PIN already exists
  IF EXISTS (SELECT 1 FROM user_pins WHERE user_id = user_uuid) THEN
    RAISE EXCEPTION 'PIN already exists for this user';
  END IF;
  
  -- Hash the PIN (using crypt with bcrypt)
  pin_hash := crypt(pin_input, gen_salt('bf'));
  
  -- Insert the hashed PIN
  INSERT INTO user_pins (user_id, pin_hash) 
  VALUES (user_uuid, pin_hash);
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_user_pin(pin_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid uuid;
  stored_hash text;
BEGIN
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get stored hash
  SELECT pin_hash INTO stored_hash 
  FROM user_pins 
  WHERE user_id = user_uuid;
  
  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;
  
  -- Verify PIN against stored hash
  RETURN (crypt(pin_input, stored_hash) = stored_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_pin(old_pin text, new_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid uuid;
  stored_hash text;
  new_hash text;
BEGIN
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get stored hash
  SELECT pin_hash INTO stored_hash 
  FROM user_pins 
  WHERE user_id = user_uuid;
  
  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;
  
  -- Verify old PIN
  IF NOT (crypt(old_pin, stored_hash) = stored_hash) THEN
    RETURN false;
  END IF;
  
  -- Hash new PIN
  new_hash := crypt(new_pin, gen_salt('bf'));
  
  -- Update PIN
  UPDATE user_pins 
  SET pin_hash = new_hash, updated_at = now() 
  WHERE user_id = user_uuid;
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_pin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid uuid;
BEGIN
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RETURN false;
  END IF;
  
  DELETE FROM user_pins WHERE user_id = user_uuid;
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_pin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid uuid;
BEGIN
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN EXISTS (SELECT 1 FROM user_pins WHERE user_id = user_uuid);
END;
$$;

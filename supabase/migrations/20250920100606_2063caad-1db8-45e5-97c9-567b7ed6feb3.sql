-- Security Fix: Update remaining functions with explicit search paths

CREATE OR REPLACE FUNCTION public.create_user_pin(pin_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, phone, country)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', ''),
    new.email,
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    COALESCE(new.raw_user_meta_data->>'country', '')
  );
  
  -- Create default NGN wallet
  INSERT INTO public.wallets (user_id, currency, balance)
  VALUES (new.id, 'NGN', 0.00);
  
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_with_password(user_uuid uuid, password_input text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  stored_password text;
BEGIN
  -- Get the admin password from system settings
  SELECT (setting_value #>> '{}') INTO stored_password 
  FROM system_settings 
  WHERE setting_key = 'admin_password';
  
  -- Check if the provided password matches and user exists
  IF stored_password = password_input AND EXISTS(SELECT 1 FROM profiles WHERE id = user_uuid) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_pin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

CREATE OR REPLACE FUNCTION public.update_user_pin(old_pin text, new_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

CREATE OR REPLACE FUNCTION public.verify_user_pin(pin_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

CREATE OR REPLACE FUNCTION public.user_has_pin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
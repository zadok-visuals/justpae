-- Final Touches to restore missing base tables

-- Ensure system_settings exists
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Seed default settings if not exists
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES 
  ('maintenance_mode', 'false', 'Enable or disable maintenance mode'),
  ('signup_enabled', 'true', 'Enable or disable new user signups')
ON CONFLICT (setting_key) DO NOTHING;

-- Ensure RLS on system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "System settings are readable by everyone" ON public.system_settings;
CREATE POLICY "System settings are readable by everyone" ON public.system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only admins can update system settings" ON public.system_settings;
CREATE POLICY "Only admins can update system settings" ON public.system_settings 
FOR ALL USING (public.is_admin_safe(auth.uid()));

-- Verify chat_messages has all columns needed for the PATCH
ALTER TABLE public.chat_messages 
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

-- Trigger for system_settings updated_at
DROP TRIGGER IF EXISTS update_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

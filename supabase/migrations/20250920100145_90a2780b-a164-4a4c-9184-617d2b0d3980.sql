-- Enable Row Level Security on admin_sessions table (should already be enabled)
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Policy 1: Admins can view and manage their own sessions
CREATE POLICY "Admins can manage their own sessions"
ON public.admin_sessions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = admin_sessions.admin_user_id 
    AND au.user_id = auth.uid()
    AND au.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = admin_sessions.admin_user_id 
    AND au.user_id = auth.uid()
    AND au.is_active = true
  )
);

-- Policy 2: Super admins can view all admin sessions for security monitoring
CREATE POLICY "Super admins can view all admin sessions"
ON public.admin_sessions
FOR SELECT
USING (
  public.get_current_admin_role() = 'super_admin'::admin_role
);

-- Policy 3: System can insert admin sessions (for login functionality)
CREATE POLICY "System can create admin sessions"
ON public.admin_sessions
FOR INSERT
WITH CHECK (true);
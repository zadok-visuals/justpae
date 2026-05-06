import { supabase } from '@/integrations/supabase/client';

interface AdminSession {
  token: string;
  expiresAt: number;
  userId: string;
}

const ADMIN_SESSION_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds
const ADMIN_SESSION_KEY = 'admin_session';

export const adminAuthService = {
  // Store admin session with expiration
  setAdminSession: (userId: string) => {
    const session: AdminSession = {
      token: `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      expiresAt: Date.now() + ADMIN_SESSION_DURATION,
      userId
    };
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    return session.token;
  },

  // Check if admin session is valid and not expired
  isValidAdminSession: (): boolean => {
    try {
      const sessionData = sessionStorage.getItem(ADMIN_SESSION_KEY);
      if (!sessionData) return false;

      const session: AdminSession = JSON.parse(sessionData);
      const now = Date.now();

      // Check if session has expired
      if (now > session.expiresAt) {
        adminAuthService.clearAdminSession();
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking admin session:', error);
      return false;
    }
  },

  // Clear admin session
  clearAdminSession: () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  },

  // Verify admin credentials using the new Supabase RPC function
  verifyAdminAccess: async (userId: string, adminPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('Verifying admin credentials via RPC for user:', userId);

      const { data, error } = await supabase.rpc('verify_admin_credentials', {
        p_user_id: userId,
        p_admin_password: adminPassword,
      });

      if (error) {
        console.error('RPC error verifying admin credentials:', error);
        return { success: false, error: `Access denied: ${error.message}` };
      }

      // The RPC function returns a JSONB object with 'success' and 'error' fields
      const result = data as { success: boolean; error?: string };
      
      if (result.success) {
        console.log('Admin access verified successfully for user:', userId);
        // Create admin session on successful verification
        adminAuthService.setAdminSession(userId);
        return { success: true };
      } else {
        console.error('Admin verification failed:', result.error);
        return { success: false, error: result.error || 'Invalid admin credentials' };
      }
    } catch (error) {
      console.error('Unexpected error during admin verification:', error);
      return { success: false, error: 'An unexpected error occurred during admin verification' };
    }
  },

  // Extend session if user is active
  extendSession: () => {
    const sessionData = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (sessionData) {
      try {
        const session: AdminSession = JSON.parse(sessionData);
        session.expiresAt = Date.now() + ADMIN_SESSION_DURATION;
        sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      } catch (error) {
        console.error('Error extending session:', error);
      }
    }
  }
};

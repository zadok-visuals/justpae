
import { supabase } from '@/integrations/supabase/client';

interface UserSession {
  userId: string;
  lastActivity: number;
  expiresAt: number;
}

const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const SESSION_KEY = 'user_session';

export const sessionService = {
  // Store user session with expiration
  setUserSession: (userId: string) => {
    const session: UserSession = {
      userId,
      lastActivity: Date.now(),
      expiresAt: Date.now() + SESSION_DURATION
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },

  // Check if user session is valid and not expired
  isValidUserSession: (): boolean => {
    try {
      const sessionData = sessionStorage.getItem(SESSION_KEY);
      if (!sessionData) return false;

      const session: UserSession = JSON.parse(sessionData);
      const now = Date.now();

      // Check if session has expired
      if (now > session.expiresAt) {
        // Don't clear PIN data on session expiry - only clear session
        sessionStorage.removeItem(SESSION_KEY);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking user session:', error);
      return false;
    }
  },

  // Clear user session but preserve PIN settings
  clearUserSession: () => {
    sessionStorage.removeItem(SESSION_KEY);
    // Preserve PIN data in localStorage - don't clear it
  },

  // Extend session if user is active
  extendUserSession: () => {
    const sessionData = sessionStorage.getItem(SESSION_KEY);
    if (sessionData) {
      const session: UserSession = JSON.parse(sessionData);
      session.lastActivity = Date.now();
      session.expiresAt = Date.now() + SESSION_DURATION;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  },

  // Force logout due to session expiry - preserve PIN
  forceLogout: async () => {
    sessionService.clearUserSession();
    await supabase.auth.signOut({ scope: 'global' });
    // Don't redirect immediately - let auth context handle it
  }
};

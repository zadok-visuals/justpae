
import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserProfile } from '@/types/auth';
import { cleanupAuthState } from '@/utils/authUtils';

export const useAuthState = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        
        if (!mounted) return;

        // Always update session and user state
        setSession(session);
        setUser(session?.user || null);
        
        if (event === 'SIGNED_OUT') {
          setProfile(null);
          setLoading(false);
          cleanupAuthState();
        } else if (event === 'SIGNED_IN' && session?.user) {
          // Defer profile fetch to avoid deadlocks
          setTimeout(() => {
            if (mounted) {
              fetchUserProfile(session.user.id);
            }
          }, 100);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Update session but don't refetch profile
          setLoading(false);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          cleanupAuthState();
          return;
        }

        if (mounted) {
          setSession(session);
          setUser(session?.user || null);
          
          if (session?.user) {
            fetchUserProfile(session.user.id);
          } else {
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('Session initialization error:', error);
        if (mounted) {
          cleanupAuthState();
          setLoading(false);
        }
      }
    };

    const fetchUserProfile = async (userId: string) => {
      try {
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (!mounted) return;

        if (error) {
          console.error('Error fetching profile:', error);
          setProfile(null);
        } else {
          setProfile(profileData);
        }
      } catch (error) {
        console.error('Profile fetch error:', error);
        if (mounted) {
          setProfile(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    getInitialSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    session,
    profile,
    loading,
    setProfile,
    setLoading
  };
};

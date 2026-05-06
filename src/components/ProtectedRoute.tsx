
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { sessionService } from '@/services/sessionService';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  redirectTo = '/login'
}) => {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    let activityTimer: NodeJS.Timeout;

    const checkSessionAndSetupMonitoring = () => {
      // Always set sessionChecked to true after initial load, regardless of auth state
      if (!sessionChecked && !loading) {
        setSessionChecked(true);
      }

      if (loading) return;

      if (!isAuthenticated || !user) {
        console.log('User not authenticated, redirecting to:', redirectTo);
        navigate(redirectTo, { replace: true });
        return;
      }

      // Set user session when authenticated
      sessionService.setUserSession(user.id);

      // Check MFA Status and Enforce AAL2 if enabled
      const checkMFAEnforcement = async () => {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!error && data.nextLevel === 'aal2' && data.currentLevel === 'aal1') {
          console.log('MFA Upgrade Required');
          navigate('/two-factor-auth?verify=true');
        }
      };

      checkMFAEnforcement();

      // Set up session monitoring
      const setupSessionMonitoring = () => {
        // Extend session on user activity
        const extendSession = () => {
          if (isAuthenticated && user) {
            sessionService.extendUserSession();
          }
        };

        // Check session validity every minute
        activityTimer = setInterval(() => {
          if (!sessionService.isValidUserSession()) {
            toast({
              title: "Session Expired",
              description: "Your session has expired. Please log in again.",
              variant: "destructive"
            });
            sessionService.forceLogout();
          }
        }, 60000); // Check every minute

        // Add activity listeners
        document.addEventListener('click', extendSession);
        document.addEventListener('keypress', extendSession);
        document.addEventListener('scroll', extendSession);
        document.addEventListener('mousemove', extendSession);

        return () => {
          document.removeEventListener('click', extendSession);
          document.removeEventListener('keypress', extendSession);
          document.removeEventListener('scroll', extendSession);
          document.removeEventListener('mousemove', extendSession);
        };
      };

      const cleanup = setupSessionMonitoring();

      return () => {
        if (activityTimer) clearInterval(activityTimer);
        if (cleanup) cleanup();
      };
    };

    const cleanup = checkSessionAndSetupMonitoring();

    return () => {
      if (cleanup) cleanup();
      if (activityTimer) clearInterval(activityTimer);
    };
  }, [isAuthenticated, loading, navigate, redirectTo, user, toast, sessionChecked]);

  // Show loading spinner while checking auth state
  if (loading || !sessionChecked) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fintech-orange mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated
  if (!isAuthenticated || !user) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

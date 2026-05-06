import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { adminAuthService } from '@/services/adminAuthService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Shield } from 'lucide-react';
import PasswordInput from '@/components/PasswordInput';

interface AdminRouteGuardProps {
  children: React.ReactNode;
}

const AdminRouteGuard: React.FC<AdminRouteGuardProps> = ({ children }) => {
  const [isVerifying, setIsVerifying] = useState(true);
  const [needsPasswordVerification, setNeedsPasswordVerification] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user, isAuthenticated, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let activityTimer: NodeJS.Timeout;

    const checkAdminAccess = async () => {
      if (loading) return;

      if (!isAuthenticated || !user) {
        setIsVerifying(false);
        navigate('/admin-login');
        return;
      }

      // Check if admin session is still valid
      if (adminAuthService.isValidAdminSession()) {
        setIsVerifying(false);
        setNeedsPasswordVerification(false);
        setupAdminActivityMonitoring();
      } else {
        setNeedsPasswordVerification(true);
        setIsVerifying(false);
      }
    };

    const setupAdminActivityMonitoring = () => {
      const extendAdminSession = () => {
        adminAuthService.extendSession();
      };

      activityTimer = setInterval(() => {
        if (!adminAuthService.isValidAdminSession()) {
          setNeedsPasswordVerification(true);
          toast({
            title: "Admin Session Expired",
            description: "Your admin session has expired. Please re-enter your admin password.",
            variant: "destructive"
          });
        }
      }, 60000);

      document.addEventListener('click', extendAdminSession);
      document.addEventListener('keypress', extendAdminSession);
      document.addEventListener('scroll', extendAdminSession);

      return () => {
        document.removeEventListener('click', extendAdminSession);
        document.removeEventListener('keypress', extendAdminSession);
        document.removeEventListener('scroll', extendAdminSession);
      };
    };

    checkAdminAccess();

    return () => {
      if (activityTimer) clearInterval(activityTimer);
    };
  }, [isAuthenticated, user, loading, navigate, toast]);

  const handleAdminPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !adminPassword) return;

    setIsLoading(true);
    try {
      const result = await adminAuthService.verifyAdminAccess(user.id, adminPassword);
      
      if (result.success) {
        setNeedsPasswordVerification(false);
        setAdminPassword('');
        toast({
          title: "Access Granted",
          description: "Welcome to the admin dashboard",
        });
      } else {
        toast({
          title: "Access Denied",
          description: result.error || "Invalid admin password",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Admin password verification error:', error);
      toast({
        title: "Error",
        description: "Failed to verify admin password",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || isVerifying) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fintech-orange mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (needsPasswordVerification) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-fintech-orange rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Admin Verification Required</CardTitle>
            <p className="text-gray-600 dark:text-gray-400">
              Please enter your admin password to access the dashboard
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdminPasswordSubmit} className="space-y-4">
              <PasswordInput
                id="adminPassword"
                label="Admin Password"
                value={adminPassword}
                onChange={setAdminPassword}
                placeholder="Enter admin password"
                required
                autoComplete="off"
              />
              
              <Button
                type="submit"
                disabled={isLoading || !adminPassword}
                className="w-full bg-fintech-orange hover:bg-fintech-orange/90"
              >
                {isLoading ? 'Verifying...' : 'Verify Access'}
              </Button>
            </form>
            
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Session expires after 10 minutes of inactivity
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default AdminRouteGuard;

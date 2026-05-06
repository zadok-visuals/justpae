import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { adminAuthService } from '@/services/adminAuthService';
import { Shield } from 'lucide-react';
import PasswordInput from '@/components/PasswordInput';
import AdminLayout from '@/components/admin/AdminLayout';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Clear any existing admin sessions first
      adminAuthService.clearAdminSession();

      // Sign in with email and password
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      // Verify admin access with admin password
      const adminResult = await adminAuthService.verifyAdminAccess(data.user.id, adminPassword);

      if (!adminResult.success) {
        toast({
          title: "Access Denied",
          description: adminResult.error || "Invalid admin credentials",
          variant: "destructive",
        });
        // Sign out the user since they don't have admin access
        await supabase.auth.signOut();
        return;
      }

      toast({
        title: "Welcome Admin",
        description: "Login successful!",
      });
      
      navigate('/admin');
    } catch (error) {
      console.error('Admin login error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-fintech-orange rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Admin Access</CardTitle>
            <p className="text-gray-600 dark:text-gray-400">
              Amazingpay Administration Panel
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@amazingpay.app"
                  required
                  className="mt-1"
                />
              </div>
              
              <PasswordInput
                id="password"
                label="Password"
                value={password}
                onChange={setPassword}
                placeholder="Enter your account password"
                required
                autoComplete="current-password"
              />

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
                disabled={isLoading}
                className="w-full bg-fintech-orange hover:bg-fintech-orange/90"
              >
                {isLoading ? 'Signing in...' : 'Sign In as Admin'}
              </Button>
            </form>
            
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Admin access only • Sessions expire after 10 minutes
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminLogin;


import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/Layout';
import { Eye, EyeOff, CheckCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const checkAuthorization = async () => {
      const verified = searchParams.get('verified');
      
      // Check if user came from token verification
      if (verified === 'true') {
        // Also check if user has a valid session from the token verification
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          setIsAuthorized(true);
        } else {
          toast({
            title: "Unauthorized Access",
            description: "Please verify your token first to reset your password.",
            variant: "destructive",
          });
          navigate('/forgot-password');
        }
      } else {
        toast({
          title: "Unauthorized Access",
          description: "Please verify your token first to reset your password.",
          variant: "destructive",
        });
        navigate('/forgot-password');
      }
      
      setIsCheckingAuth(false);
    };

    checkAuthorization();
  }, [searchParams, navigate, toast]);

  const validatePassword = (password: string) => {
    const minLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    return {
      minLength,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecialChar,
      isValid: minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar
    };
  };

  const passwordValidation = validatePassword(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwordValidation.isValid) {
      toast({
        title: "Invalid Password",
        description: "Please ensure your password meets all requirements.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please ensure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Your password has been updated successfully!",
        });
        
        // Sign out the user to ensure they use the new password
        await supabase.auth.signOut();
        navigate('/login');
      }
    } catch (error) {
      console.error('Reset password error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <Layout showNavbar={false}>
        <div className="min-h-screen bg-gray-900 flex flex-col justify-center items-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
          <p className="mt-4 text-white">Verifying authorization...</p>
        </div>
      </Layout>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <Layout showNavbar={false}>
      <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <img 
              src="/lovable-uploads/d8bf89ab-4a7e-4d3a-b1d3-c492661136b6.png" 
              alt="Amazingpay Logo" 
              className="w-16 h-16 object-contain"
            />
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold text-white">
            Set new password
          </h2>
          <p className="mt-2 text-center text-sm text-white/80">
            Create a strong password for your account
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-gray-800 py-8 px-4 shadow-xl sm:rounded-lg sm:px-10 border border-gray-700">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <Label htmlFor="password" className="block text-sm font-medium text-white">
                  New Password
                </Label>
                <div className="mt-1 relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary text-white"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>

                {/* Password Requirements */}
                {password && (
                  <div className="mt-2 space-y-1">
                    <div className={`flex items-center text-xs ${passwordValidation.minLength ? 'text-green-500' : 'text-gray-400'}`}>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      At least 8 characters
                    </div>
                    <div className={`flex items-center text-xs ${passwordValidation.hasUpperCase ? 'text-green-500' : 'text-gray-400'}`}>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      One uppercase letter
                    </div>
                    <div className={`flex items-center text-xs ${passwordValidation.hasLowerCase ? 'text-green-500' : 'text-gray-400'}`}>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      One lowercase letter
                    </div>
                    <div className={`flex items-center text-xs ${passwordValidation.hasNumbers ? 'text-green-500' : 'text-gray-400'}`}>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      One number
                    </div>
                    <div className={`flex items-center text-xs ${passwordValidation.hasSpecialChar ? 'text-green-500' : 'text-gray-400'}`}>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      One special character
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="block text-sm font-medium text-white">
                  Confirm New Password
                </Label>
                <div className="mt-1 relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary text-white"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                
                {/* Password Match Indicator */}
                {confirmPassword && (
                  <div className={`mt-1 text-xs ${password === confirmPassword ? 'text-green-500' : 'text-red-400'}`}>
                    {password === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </div>
                )}
              </div>

              <div>
                <Button
                  type="submit"
                  disabled={isLoading || !passwordValidation.isValid || password !== confirmPassword}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
                >
                  {isLoading ? 'Updating...' : 'Update password'}
                </Button>
              </div>

              <div className="text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to sign in
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ResetPassword;

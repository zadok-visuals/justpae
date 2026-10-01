
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
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
      <div className="h-screen w-full bg-[#0a0c10] flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-gray-400 text-sm font-medium">Verifying authorization...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="h-screen w-full bg-[#0a0c10] flex flex-col justify-start sm:justify-center items-center pt-8 pb-24 px-4 sm:px-6 lg:px-8 text-white relative overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {/* Decorative Background Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-[80%] h-[30%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md space-y-5 sm:space-y-8 relative z-10 my-4 sm:my-auto">
        <div className="flex flex-row items-center gap-4">
          <div className="relative p-[2px] rounded-2xl bg-gradient-to-b from-white/20 to-transparent shrink-0">
            <div className="bg-[#14171c] rounded-[14px] p-3 shadow-2xl">
              <img
                src="/lovable-uploads/d8bf89ab-4a7e-4d3a-b1d3-c492661136b6.png"
                alt="justpae Logo"
                className="w-10 h-10 object-contain"
              />
            </div>
          </div>
          <div className="text-left">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              New Password
            </h2>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-400 font-medium text-white/80">
              Create a strong password for your account
            </p>
          </div>
        </div>

        <div className="bg-[#14171c]/80 backdrop-blur-xl py-6 px-4 sm:py-8 sm:px-10 shadow-2xl rounded-3xl border border-white/5">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-gray-300 ml-1">
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 bg-white/5 border-white/10 rounded-xl focus:ring-primary focus:border-primary text-white placeholder:text-gray-500 pr-10"
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
                <div className="mt-2 space-y-1.5 bg-[#0a0c10]/40 p-3 rounded-xl border border-white/5">
                  <div className={`flex items-center text-xs ${passwordValidation.minLength ? 'text-emerald-500' : 'text-gray-400'}`}>
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                    At least 8 characters
                  </div>
                  <div className={`flex items-center text-xs ${passwordValidation.hasUpperCase ? 'text-emerald-500' : 'text-gray-400'}`}>
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                    One uppercase letter
                  </div>
                  <div className={`flex items-center text-xs ${passwordValidation.hasLowerCase ? 'text-emerald-500' : 'text-gray-400'}`}>
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                    One lowercase letter
                  </div>
                  <div className={`flex items-center text-xs ${passwordValidation.hasNumbers ? 'text-emerald-500' : 'text-gray-400'}`}>
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                    One number
                  </div>
                  <div className={`flex items-center text-xs ${passwordValidation.hasSpecialChar ? 'text-emerald-500' : 'text-gray-400'}`}>
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                    One special character
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-semibold text-gray-300 ml-1">
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-12 bg-white/5 border-white/10 rounded-xl focus:ring-primary focus:border-primary text-white placeholder:text-gray-500 pr-10"
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
                <div className={`mt-1.5 text-xs font-semibold ml-1 ${password === confirmPassword ? 'text-emerald-500' : 'text-red-400'}`}>
                  {password === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading || !passwordValidation.isValid || password !== confirmPassword}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12 rounded-xl transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? 'Updating...' : 'Update password'}
            </Button>

            <div className="text-center pt-2">
              <Link
                to="/login"
                className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back to sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

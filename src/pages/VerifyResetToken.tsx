
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Key } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

const VerifyResetToken = () => {
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token.trim()) {
      toast({
        title: "Token Required",
        description: "Please enter the verification token from your email.",
        variant: "destructive",
      });
      return;
    }

    if (!email) {
      toast({
        title: "Invalid Link",
        description: "Email parameter is missing. Please use the link from your email.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: token.trim(),
        type: 'recovery'
      });

      if (error) {
        toast({
          title: "Invalid Token",
          description: error.message || "The token is invalid or has expired.",
          variant: "destructive",
        });
      } else if (data.session) {
        toast({
          title: "Token Verified",
          description: "Token verified successfully! You can now set your new password.",
        });
        // Redirect to reset password page with verified session
        navigate('/reset-password?verified=true');
      } else {
        toast({
          title: "Verification Failed",
          description: "Unable to verify the token. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Token verification error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resendToken = async () => {
    if (!email) {
      toast({
        title: "Error",
        description: "Cannot resend token without email.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Token Resent",
          description: "A new verification token has been sent to your email.",
        });
      }
    } catch (error) {
      console.error('Resend token error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while resending the token.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="h-screen w-full bg-fintech-shell flex flex-col justify-start sm:justify-center items-center pt-8 pb-24 px-4 sm:px-6 lg:px-8 text-white relative overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* Decorative Background Glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-[80%] h-[30%] bg-primary/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]" />
        </div>

        <div className="w-full max-w-md space-y-5 relative z-10 my-4 sm:my-auto">
          <div className="bg-fintech-card/80 backdrop-blur-xl py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-white/5 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">Invalid Access</h2>
            <p className="text-gray-400 mb-6 text-sm font-medium">This page requires a valid email parameter.</p>
            <Link to="/forgot-password">
              <Button className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12 rounded-xl transition-all shadow-lg shadow-primary/20 active:scale-[0.98]">
                Go to Forgot Password
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-fintech-shell flex flex-col justify-start sm:justify-center items-center pt-8 pb-24 px-4 sm:px-6 lg:px-8 text-white relative overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {/* Decorative Background Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-[80%] h-[30%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md space-y-5 sm:space-y-8 relative z-10 my-4 sm:my-auto">
        <div className="flex flex-row items-center gap-4">
          <div className="relative p-[2px] rounded-2xl bg-gradient-to-b from-white/20 to-transparent shrink-0">
            <div className="bg-fintech-card rounded-[14px] p-3 shadow-2xl">
              <Key className="w-10 h-10 text-primary" />
            </div>
          </div>
          <div className="text-left">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Verify Token
            </h2>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-400 font-medium text-white/80">
              We sent a verification token to <span className="font-semibold text-primary">{email}</span>
            </p>
          </div>
        </div>

        <div className="bg-fintech-card/80 backdrop-blur-xl py-6 px-4 sm:py-8 sm:px-10 shadow-2xl rounded-3xl border border-white/5">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-semibold text-gray-300 ml-1">
                Verification Token
              </Label>
              <Input
                id="token"
                name="token"
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="h-12 bg-white/5 border-white/10 rounded-xl focus:ring-primary focus:border-primary text-white placeholder:text-gray-500 text-center tracking-widest text-lg font-bold"
                placeholder="000000"
                maxLength={6}
              />
              <p className="mt-1.5 text-xs text-gray-400 font-medium ml-1">
                Check your email for the 6-digit verification code
              </p>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !token.trim()}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12 rounded-xl transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? 'Verifying...' : 'Verify Token'}
            </Button>

            <div className="text-center space-y-4 pt-2">
              <button
                type="button"
                onClick={resendToken}
                disabled={isLoading}
                className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              >
                Didn't receive the token? Resend it
              </button>
              
              <div>
                <Link
                  to="/forgot-password"
                  className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back to forgot password
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default VerifyResetToken;


import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/Layout';
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
      <Layout showNavbar={false}>
        <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-gray-800 py-8 px-4 shadow-xl sm:rounded-lg sm:px-10 border border-gray-700">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-4">Invalid Access</h2>
                <p className="text-white/80 mb-6">This page requires a valid email parameter.</p>
                <Link to="/forgot-password">
                  <Button className="w-full bg-primary hover:bg-primary/90">
                    Go to Forgot Password
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showNavbar={false}>
      <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Key className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold text-white">
            Enter verification token
          </h2>
          <p className="mt-2 text-center text-sm text-white/80">
            We've sent a verification token to <span className="font-medium text-primary">{email}</span>
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-gray-800 py-8 px-4 shadow-xl sm:rounded-lg sm:px-10 border border-gray-700">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <Label htmlFor="token" className="block text-sm font-medium text-white">
                  Verification Token
                </Label>
                <div className="mt-1">
                  <Input
                    id="token"
                    name="token"
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary text-white"
                    placeholder="Enter the 6-digit token from your email"
                    maxLength={6}
                  />
                </div>
                <p className="mt-1 text-xs text-white/60">
                  Check your email for a 6-digit verification code
                </p>
              </div>

              <div>
                <Button
                  type="submit"
                  disabled={isLoading || !token.trim()}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
                >
                  {isLoading ? 'Verifying...' : 'Verify Token'}
                </Button>
              </div>

              <div className="text-center space-y-3">
                <button
                  type="button"
                  onClick={resendToken}
                  disabled={isLoading}
                  className="text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50"
                >
                  Didn't receive the token? Resend it
                </button>
                
                <div>
                  <Link
                    to="/forgot-password"
                    className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back to forgot password
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default VerifyResetToken;

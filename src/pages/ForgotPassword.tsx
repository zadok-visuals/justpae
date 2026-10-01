
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          title: "Success",
          description: "Password reset token sent! Check your inbox.",
        });
        // Navigate to token verification page with email parameter
        navigate(`/verify-reset-token?email=${encodeURIComponent(email)}`);
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
              <img
                src="/lovable-uploads/d8bf89ab-4a7e-4d3a-b1d3-c492661136b6.png"
                alt="justpae Logo"
                className="w-10 h-10 object-contain"
              />
            </div>
          </div>
          <div className="text-left">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Reset Password
            </h2>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-400 font-medium text-white/80">
              Enter your email to receive a verification token
            </p>
          </div>
        </div>

        <div className="bg-fintech-card/80 backdrop-blur-xl py-6 px-4 sm:py-8 sm:px-10 shadow-2xl rounded-3xl border border-white/5">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-gray-300 ml-1">
                Email address
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-white/5 border-white/10 rounded-xl focus:ring-primary focus:border-primary text-white placeholder:text-gray-500"
                placeholder="Enter your email address"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12 rounded-xl transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? 'Sending...' : 'Send verification token'}
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

export default ForgotPassword;

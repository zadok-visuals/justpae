
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, RefreshCw } from 'lucide-react';

interface EmailVerificationFormProps {
  email: string;
  onVerificationSuccess: () => void;
  onResendCode: () => void;
  onBack?: () => void;
}

const EmailVerificationForm: React.FC<EmailVerificationFormProps> = ({
  email,
  onVerificationSuccess,
  onResendCode,
  onBack
}) => {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { verifyOtp } = useAuth();
  const { toast } = useToast();

  // Start countdown when component mounts
  useEffect(() => {
    setCountdown(60); // 1 minute countdown
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code || code.length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter a valid 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    try {
      const result = await verifyOtp(email, code);

      if (result.error) {
        toast({
          title: "Verification Failed",
          description: result.error,
          variant: "destructive",
        });
      } else if (result.success) {
        toast({
          title: "Email Verified!",
          description: "Your email has been successfully verified.",
        });
        onVerificationSuccess();
      }
    } catch (error) {
      console.error('Verification error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred during verification.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (countdown > 0) return;
    
    setIsResending(true);
    try {
      await onResendCode();
      setCountdown(60); // Reset countdown
    } catch (error) {
      console.error('Resend error:', error);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto bg-gray-800 text-white border-gray-700 shadow-2xl rounded-2xl overflow-hidden">
      <CardHeader className="text-center pt-10 pb-6">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-inner">
            <Mail className="w-10 h-10 text-primary" />
          </div>
        </div>
        <CardTitle className="text-3xl font-extrabold tracking-tight mb-2">Verify Your Email</CardTitle>
        <div className="space-y-1 px-4">
          <p className="text-gray-400 text-sm">
            We've sent a 6-digit verification code to
          </p>
          <p className="font-bold text-primary text-lg break-all">{email}</p>
        </div>
      </CardHeader>
      
      <CardContent className="px-8 pb-10">
        <form onSubmit={handleVerifyCode} className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="code" className="text-gray-300 text-sm font-medium ml-1">Verification Code</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="0 0 0 0 0 0"
              className="text-center text-3xl font-mono tracking-[0.5em] h-16 bg-gray-700/50 border-gray-600 text-white focus:ring-primary/50 placeholder:text-gray-600 rounded-xl"
              required
              autoFocus
            />
            <p className="text-center text-xs text-gray-500">
              Enter the 6-digit code from your inbox
            </p>
          </div>
          
          <Button
            type="submit"
            disabled={isVerifying || code.length !== 6}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12 rounded-xl transition-all shadow-lg shadow-primary/20"
          >
            {isVerifying ? 'Verifying...' : 'Verify Email'}
          </Button>
        </form>

        <div className="mt-8 text-center border-t border-gray-700 pt-6">
          <p className="text-sm text-gray-400 mb-3">
            Didn't receive the code?
          </p>
          <Button
            variant="outline"
            onClick={handleResendCode}
            disabled={isResending || countdown > 0}
            className="w-full bg-transparent border-gray-600 hover:bg-gray-700 text-gray-300 h-11 rounded-xl transition-all"
          >
            {isResending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Resending...
              </>
            ) : countdown > 0 ? (
              `Resend Code (${countdown}s)`
            ) : (
              'Resend Code'
            )}
          </Button>
        </div>

        {onBack && (
          <div className="mt-4 text-center">
            <Button
              variant="link"
              onClick={onBack}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Change email address
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EmailVerificationForm;

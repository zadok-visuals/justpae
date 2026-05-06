
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
}

const EmailVerificationForm: React.FC<EmailVerificationFormProps> = ({
  email,
  onVerificationSuccess,
  onResendCode
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
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-fintech-orange rounded-full flex items-center justify-center">
            <Mail className="w-8 h-8 text-white" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">Verify Your Email</CardTitle>
        <p className="text-gray-600 dark:text-gray-400">
          We've sent a 6-digit verification code to
        </p>
        <p className="font-medium text-fintech-orange">{email}</p>
        <p className="text-sm text-gray-500 mt-2">
          Enter the code below to verify your account.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div>
            <Label htmlFor="code">Verification Code</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 6-digit code"
              className="text-center text-lg tracking-widest"
              required
            />
          </div>
          
          <Button
            type="submit"
            disabled={isVerifying || code.length !== 6}
            className="w-full bg-fintech-orange hover:bg-fintech-orange/90"
          >
            {isVerifying ? 'Verifying...' : 'Verify Email'}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Didn't receive the code?
          </p>
          <Button
            variant="link"
            onClick={handleResendCode}
            disabled={isResending || countdown > 0}
            className="text-fintech-orange hover:text-fintech-orange/80"
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
      </CardContent>
    </Card>
  );
};

export default EmailVerificationForm;

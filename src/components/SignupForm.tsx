
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import PhoneInput from '@/components/PhoneInput';
import CountrySelector from '@/components/CountrySelector';
import EmailVerificationForm from '@/components/EmailVerificationForm';
import { Eye, EyeOff } from 'lucide-react';

const SignupForm: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('+234');
  const [country, setCountry] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  
  const { signup, resendOtp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email || !password) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log('Attempting signup with:', { email, name, phone: `${phoneCode}${phone}`, country });
      
      const result = await signup(email, password, name, `${phoneCode}${phone}`, country);

      if (result.error) {
        toast({
          title: "Signup Failed",
          description: result.error,
          variant: "destructive",
        });
      } else if (result.needsVerification) {
        setSignupEmail(email);
        setShowVerification(true);
        toast({
          title: "Verification Required",
          description: "Please check your email for a verification code.",
        });
      } else {
        toast({
          title: "Success",
          description: "Account created successfully!",
        });
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred during signup.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerificationSuccess = () => {
    setShowVerification(false);
    toast({
      title: "Email Verified!",
      description: "Your account has been verified successfully. You can now log in.",
    });
    navigate('/login');
  };

  const handleResendCode = async () => {
    try {
      const result = await resendOtp(signupEmail);
      if (result.error) {
        toast({
          title: "Resend Failed",
          description: result.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Code Sent",
          description: "A new verification code has been sent to your email.",
        });
      }
    } catch (error) {
      console.error('Resend error:', error);
      toast({
        title: "Error",
        description: "Failed to resend verification code.",
        variant: "destructive",
      });
    }
  };

  if (showVerification) {
    return (
      <EmailVerificationForm
        email={signupEmail}
        onVerificationSuccess={handleVerificationSuccess}
        onResendCode={handleResendCode}
      />
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto bg-gray-900 text-white border-gray-800">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">Create Account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name" className="text-white">Full Name *</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              required
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>
          
          <div>
            <Label htmlFor="email" className="text-white">Email *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>
          
          <div>
            <Label htmlFor="password" className="text-white">Password *</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                minLength={6}
                className="bg-gray-800 border-gray-700 text-white pr-10"
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
          </div>
          
          <PhoneInput
            phone={phone}
            phoneCode={phoneCode}
            country={country}
            onPhoneChange={setPhone}
            onPhoneCodeChange={setPhoneCode}
            onCountryChange={setCountry}
          />
          
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/95"
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </Button>
        </form>
        
        <div className="mt-4 text-center text-sm text-gray-300">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:text-primary/80">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export default SignupForm;

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  
  const { signup, resendOtp, signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleGoogleSignup = async () => {
    const result = await signInWithGoogle();
    if (result.error) {
      toast({
        title: "Google Signup Failed",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const isPasswordStrong = (pass: string) => {
    const minLength = pass.length >= 8;
    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    
    return {
      score: [minLength, hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length,
      requirements: { minLength, hasUpper, hasLower, hasNumber, hasSpecial }
    };
  };

  const passwordStrength = isPasswordStrong(password);

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

    if (passwordStrength.score < 5) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
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
      const result = await resendOtp(signupEmail || email);
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
        email={signupEmail || email}
        onVerificationSuccess={handleVerificationSuccess}
        onResendCode={handleResendCode}
        onBack={() => setShowVerification(false)}
      />
    );
  }

  return (
    <form className="space-y-4 sm:space-y-6" onSubmit={handleSubmit}>
      {/* Full Name Input Group */}
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-semibold text-gray-300 ml-1">
          Full Name
        </Label>
        <Input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 bg-white/5 border-white/10 rounded-xl focus:ring-primary focus:border-primary text-white placeholder:text-gray-500"
          placeholder="Enter your full name"
        />
      </div>

      {/* Email Input Group */}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-semibold text-gray-300 ml-1">
          Email address
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 bg-white/5 border-white/10 rounded-xl focus:ring-primary focus:border-primary text-white placeholder:text-gray-500"
          placeholder="Enter your email"
        />
      </div>

      {/* Password Input Group */}
      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-semibold text-gray-300 ml-1">
          Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 bg-white/5 border-white/10 rounded-xl pr-12 focus:ring-primary focus:border-primary text-white placeholder:text-gray-500"
            placeholder="Min. 8 characters"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-300 transition-colors"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Password Strength Indicator */}
        {password.length > 0 && (
          <div className="space-y-2 mt-2 px-1">
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i < passwordStrength.score 
                      ? i < 2 ? 'bg-red-500' : i < 4 ? 'bg-yellow-500' : 'bg-emerald-500'
                      : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-medium text-gray-400">
              <div className={passwordStrength.requirements.minLength ? 'text-emerald-400 font-bold' : ''}>• 8+ characters</div>
              <div className={passwordStrength.requirements.hasUpper ? 'text-emerald-400 font-bold' : ''}>• Uppercase</div>
              <div className={passwordStrength.requirements.hasLower ? 'text-emerald-400 font-bold' : ''}>• Lowercase</div>
              <div className={passwordStrength.requirements.hasNumber ? 'text-emerald-400 font-bold' : ''}>• Number</div>
              <div className={passwordStrength.requirements.hasSpecial ? 'text-emerald-400 font-bold' : ''}>• Special character</div>
            </div>
          </div>
        )}
      </div>

      {/* Phone input wrapper inheriting clean spacing matches */}
      <div className="pt-1 text-white custom-phone-container">
        <PhoneInput
          phone={phone}
          phoneCode={phoneCode}
          country={country}
          onPhoneChange={setPhone}
          onPhoneCodeChange={setPhoneCode}
          onCountryChange={setCountry}
        />
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {isLoading ? 'Creating account...' : 'Create Account'}
        </Button>
      </div>

      {/* Divider Separator */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
          <span className="px-4 bg-fintech-card text-gray-500">Or continue with</span>
        </div>
      </div>

      {/* Google Signup Button */}
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleSignup}
        className="w-full h-12 border-white/10 rounded-xl font-bold text-gray-500 dark:text-gray-400 hover:bg-white/5 transition-all active:scale-[0.98]"
      >
        <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.07-3.71 1.07-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.67-.35-1.39-.35-2.09s.13-1.42.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1c-1.9 0-3.66.74-4.96 1.94l3.66 2.84c.87-.58 1.93-.94 3.3-.94 2.86 0 5.29 1.93 6.16 4.53z"
            fill="#EA4335"
          />
        </svg>
        Google
      </Button>

      {/* Redirect Footer Links */}
      <div className="text-center pt-4">
        <p className="text-sm text-gray-500 font-medium">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-bold text-primary hover:text-primary/80 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
};

export default SignupForm;

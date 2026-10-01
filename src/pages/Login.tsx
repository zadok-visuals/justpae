
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

import { Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { login, signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const loginWithGoogle = async () => {
    const result = await signInWithGoogle();
    if (result.error) {
      toast({
        title: "Google Login Failed",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await login(email, password);

      if (result.error) {
        toast({
          title: "Login Failed",
          description: result.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Logged in successfully!",
        });
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
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
          <div className='text-left'>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome Back
            </h2>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-400 font-medium">
              Sign in to your justpae account
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
                placeholder="Enter your email"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <Label htmlFor="password" className="text-sm font-semibold text-gray-300">
                  Password
                </Label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 bg-white/5 border-white/10 rounded-xl pr-12 focus:ring-primary focus:border-primary text-white placeholder:text-gray-500"
                  placeholder="Enter your password"
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
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </div>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                <span className="px-4 bg-fintech-card text-gray-500">Or continue with</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => loginWithGoogle()}
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

            <div className="text-center pt-4">
              <p className="text-sm text-gray-500 font-medium">
                Don't have an account?{' '}
                <Link
                  to="/signup"
                  className="font-bold text-primary hover:text-primary/80 transition-colors"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;

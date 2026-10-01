
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const SplashScreen = () => {
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      if (isAuthenticated) {
        navigate('/dashboard');
      } else {
        navigate('/welcome');
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, navigate]);

  if (!isLoading) return null;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col justify-center items-center text-white relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/4 left-1/4 w-20 h-20 bg-white/5 rounded-full animate-float" style={{ animationDelay: '2s' }} />
      </div>

      <div className="text-center space-y-8 animate-in fade-in zoom-in duration-700 relative z-10 px-6">
        {/* Logo Container */}
        <div className="relative inline-block">
          <div className="w-24 h-24 sm:w-32 sm:h-32 mx-auto bg-white/10 rounded-3xl flex items-center justify-center backdrop-blur-xl shadow-2xl border border-white/20">
            <img
              src="/lovable-uploads/d8bf89ab-4a7e-4d3a-b1d3-c492661136b6.png"
              alt="justpae Logo"
              className="w-16 h-16 sm:w-20 sm:h-20 object-contain animate-float"
            />
          </div>
          <div className="absolute -inset-4 bg-primary/20 rounded-full blur-2xl animate-pulse -z-10" />
        </div>

        {/* App Name & Slogan */}
        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
            justpae
          </h1>
          <p className="text-lg sm:text-xl text-white/70 font-light tracking-wide">
            More Than Crypto
          </p>
        </div>

        {/* Modern Loading Animation */}
        <div className="flex justify-center items-center space-x-3 pt-4">
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
        </div>
      </div>

      {/* Bottom Footer Info */}
      <div className="absolute bottom-12 left-0 right-0 text-center px-6 space-y-4">
        <p className="text-white/40 text-xs sm:text-sm font-medium uppercase tracking-[0.2em]">
          Secure • Fast • Trusted
        </p>
        <p className="text-[10px] sm:text-xs text-white/30 max-w-xs mx-auto leading-relaxed">
          Powered by industry-leading security protocols to keep your assets safe.
        </p>
      </div>
    </div>
  );
};

export default SplashScreen;

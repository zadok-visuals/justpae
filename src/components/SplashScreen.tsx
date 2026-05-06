
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';

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
    <Layout showNavbar={false}>
    <div className="min-h-screen bg-gray-900 flex flex-col text-white relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-8 h-8 bg-white/5 rounded-full animate-pulse" />
          <div className="absolute bottom-40 left-10 w-6 h-6 bg-white/10 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/3 left-1/2 w-4 h-4 bg-white/5 rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        <div className="min-h-screen bg-gray-900 flex flex-col justify-center items-center text-white relative overflow-hidden">
          {/* Background Elements */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/5 rounded-full animate-float" />
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-white/5 rounded-full animate-float" style={{ animationDelay: '1s' }} />
            <div className="absolute top-1/4 left-1/4 w-20 h-20 bg-white/5 rounded-full animate-float" style={{ animationDelay: '2s' }} />
          </div>

          <div className="text-center space-y-8 animate-fade-in relative z-10">
            {/* Logo */}
            <div className="relative">
              <div className="w-24 h-24 mx-auto bg-white/10 rounded-3xl flex items-center justify-center backdrop-blur-lg shadow-2xl">
                <img 
                  src="/lovable-uploads/d8bf89ab-4a7e-4d3a-b1d3-c492661136b6.png" 
                  alt="Amazingpay Logo" 
                  className="w-16 h-16 object-contain"
                />
              </div>
              <div className="absolute -inset-2 bg-gradient-to-r from-white/10 to-transparent rounded-3xl animate-pulse" />
            </div>

            {/* App Name */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">
                AmazingPay
              </h1>
              <p className="text-lg opacity-90 font-light">
                More Than Crypto
              </p>
            </div>

            {/* Loading Animation */}
            <div className="flex justify-center space-x-2">
              <div className="w-3 h-3 bg-white rounded-full animate-bounce" />
              <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
          </div>

          {/* Bottom Tagline */}
          <div className="absolute bottom-12 left-0 right-0 text-center">
            <p className="text-white/70 text-sm font-light">
              Secure • Fast • Trusted
            </p>
          </div>
        </div>

        {/* Bottom Text */}
        <div className="text-center pb-8 px-6">
          <p className="text-sm opacity-60 max-w-xs mx-auto leading-relaxed">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default SplashScreen;

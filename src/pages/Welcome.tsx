import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronRight, Bitcoin, DollarSign, ArrowRight } from 'lucide-react';
import Layout from '@/components/Layout';


const Welcome = () => {
  return (
    <Layout showNavbar={false} fullWidth={true}>
      <div className="min-h-screen w-full bg-gray-900 flex flex-col text-white relative overflow-hidden">
        
        {/* Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-10 w-8 h-8 bg-white/5 rounded-full animate-pulse" />
          <div className="absolute bottom-40 left-10 w-6 h-6 bg-white/10 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/3 left-1/2 w-4 h-4 bg-white/5 rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        <div className="flex-1 flex flex-col justify-center px-6 relative z-10">
          <div className="space-y-12 animate-fade-in">
            
            {/* Logo & Brand */}
            <div className="text-center space-y-4">
              <div className="flex justify-center mb-6">
                <img 
                  src="/lovable-uploads/d8bf89ab-4a7e-4d3a-b1d3-c492661136b6.png" 
                  alt="Amazingpay Logo" 
                  className="w-16 h-16 object-contain"
                />
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl font-bold tracking-tight">
                  Powering Your
                </h1>
                <h2 className="text-4xl font-bold tracking-tight text-white/90">
                  Financial Freedom
                </h2>
                <p className="text-sm opacity-80 font-light leading-relaxed max-w-sm mx-auto">
                  More than just crypto - a digital platform designed to simplify your money management.
                </p>
              </div>
            </div>

            {/* Crypto/Fiat Illustration */}
            <div className="flex justify-center my-12">
              <div className="relative">
                {/* Background Circle */}
                <div className="absolute inset-0 bg-white/5 backdrop-blur-sm rounded-full transform scale-150"></div>
                
                {/* Crypto Icon */}
                <div className="absolute -left-8 top-4 w-20 h-20 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-full flex items-center justify-center shadow-lg z-10 animate-float">
                  <Bitcoin className="w-10 h-10 text-white" />
                </div>
                
                {/* Fiat Icon */}
                <div className="absolute -right-8 top-12 w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg z-10 animate-float" style={{ animationDelay: '1.5s' }}>
                  <DollarSign className="w-10 h-10 text-white" />
                </div>
                
                {/* Middle Connection */}
                <div className="w-44 h-44 flex items-center justify-center">
                  <div className="w-32 h-32 bg-white/10 border border-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
                    <ArrowRight className="w-8 h-8 text-white" />
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="space-y-4 max-w-sm mx-auto">
              <Link to="/signup" className="block">
                <Button className="w-full bg-primary text-white font-semibold h-12 rounded-2xl text-lg shadow-xl hover:bg-primary">
                  Get started
                </Button>
              </Link>
              <Link to="/login" className="block">
                <Button variant="outline" className="w-full border-2 border-white/30 text-white bg-transparent font-semibold h-12 rounded-2xl text-lg backdrop-blur-lg ">
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom Text */}
        <div className="text-center pb-8 px-6 relative z-10">
          <p className="text-sm opacity-60 max-w-xs mx-auto leading-relaxed">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Welcome;

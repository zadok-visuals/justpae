import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Bitcoin, DollarSign, Zap, ShieldCheck, Globe } from 'lucide-react';


const Welcome = () => {
  return (
    <>
      {/* Container limits height to 100vh on desktop to prevent unnecessary scrolling */}
      <div className="min-h-screen lg:h-screen w-full bg-fintech-shell flex flex-col text-white relative overflow-hidden font-sans">

        {/* Decorative Background Glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] lg:top-[-20%] left-1/2 lg:left-[20%] -translate-x-1/2 lg:translate-x-0 w-[80%] lg:w-[40%] h-[30%] lg:h-[60%] bg-primary/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[50%] h-[40%] bg-fintech-green/5 rounded-full blur-[120px]" />
        </div>

        {/* Core Content: Adapts from 1 column on mobile to 2 columns on desktop */}
        <div className="flex-1 max-w-7xl mx-auto w-full px-6 sm:px-12 py-12 lg:py-0 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">

          {/* Left Column: Copy & Identity (Top on mobile) */}
          <div className="space-y-8 lg:space-y-12 text-center lg:text-left flex flex-col items-center lg:items-start justify-center">

            {/* Premium App Icon styling */}
            <div className="inline-block relative p-[2px] rounded-3xl bg-gradient-to-b from-white/20 to-transparent">
              <div className="bg-fintech-card rounded-[22px] p-4 shadow-2xl">
                <img
                  src="/lovable-uploads/d8bf89ab-4a7e-4d3a-b1d3-c492661136b6.png"
                  alt="justpae Logo"
                  className="w-12 h-12 object-contain"
                />
              </div>
            </div>

            <div className="space-y-6">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
                Financial <br className="hidden lg:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-fintech-orange-light to-primary">
                  Freedom.
                </span>
              </h1>
              <p className="text-gray-400 text-lg font-medium leading-relaxed max-w-[340px] lg:max-w-md mx-auto lg:mx-0">
                The smart, high-yield digital bridge between crypto assets and your daily transactions.
              </p>
            </div>

            {/* Feature Badges - Hidden on ultra small, shown on tablet/desktop */}
            <div className="hidden sm:flex items-center gap-3">
              {[
                { icon: ShieldCheck, text: "Bank-Grade" },
                { icon: Globe, text: "Worldwide" }
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 text-[11px] font-bold uppercase tracking-wider text-gray-300">
                  <item.icon className="w-3.5 h-3.5 text-primary" />
                  {item.text}
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Interaction Card & CTAs */}
          <div className="w-full flex flex-col justify-between lg:justify-center items-center space-y-10 lg:space-y-12 max-w-md mx-auto lg:bg-white/[0.02] lg:border lg:border-white/5 lg:backdrop-blur-md lg:p-10 lg:rounded-[2.5rem]">

            {/* Visual Node Bridge Component */}
            <div className="relative flex justify-center items-center w-full py-6 lg:py-4">
              <div className="absolute w-64 h-64 border border-white/5 rounded-full animate-[spin_25s_linear_infinite]" />
              <div className="absolute w-48 h-48 border border-white/10 rounded-full animate-[spin_18s_linear_infinite_reverse]" />

              <div className="relative z-20 flex items-center gap-4">
                {/* Crypto Asset Node */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-fintech-orange-light to-fintech-orange-dark rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(217,161,74,0.25)] animate-float">
                  <Bitcoin className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>

                {/* Processing/Bridge Node */}
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/5 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center">
                  <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-primary fill-primary/20" />
                </div>

                {/* Fiat Currency Node */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-fintech-green-light to-fintech-green rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(60,154,116,0.2)] animate-float" style={{ animationDelay: '1s' }}>
                  <DollarSign className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
              </div>
            </div>

            {/* Action Group */}
            <div className="space-y-6 w-full">
              <div className="space-y-4 w-full">
                <Link to="/signup" className="block w-full">
                  <Button className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-14 sm:h-16 rounded-2xl text-lg sm:text-xl transition-all shadow-xl shadow-primary/20 active:scale-[0.98]">
                    Get Started
                  </Button>
                </Link>
                <Link to="/login" className="block w-full">
                  <Button variant="ghost" className="w-full text-white hover:bg-white/5 font-semibold h-14 sm:h-16 rounded-2xl text-base sm:text-lg border border-white/10 transition-all">
                    Sign In
                  </Button>
                </Link>
              </div>

              {/* Regulatory disclaimer/Legal baseline */}
              <p className="text-center text-[11px] text-gray-500 px-4 leading-relaxed">
                By continuing, you agree to our <span className="text-gray-400 underline cursor-pointer hover:text-white transition-colors">Terms</span> and <span className="text-gray-400 underline cursor-pointer hover:text-white transition-colors">Privacy Policy</span>
              </p>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default Welcome;

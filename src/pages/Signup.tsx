import React from 'react';
import SignupForm from '@/components/SignupForm';

const Signup = () => {
  return (
    // Added pointer-events-none to the root, but we restore it on the form container below
    <div className="w-full h-screen bg-[#0a0c10] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] text-white relative">

      {/* Decorative Background Glows - Strictly isolated with z-0 and pointer-events-none */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-[80%] h-[30%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Form Content Wrapper - Elevated with z-10 and forced pointer-events-auto */}
      <div className="w-full min-h-full flex flex-col justify-start sm:justify-center items-center pt-12 pb-24 px-4 sm:px-6 lg:px-8 relative z-10 pointer-events-auto">

        <div className="w-full max-w-md space-y-5 sm:space-y-8 my-auto pointer-events-auto">
          <div className="flex flex-row items-center gap-4">
            <div className="relative p-[2px] rounded-2xl bg-gradient-to-b from-white/20 to-transparent shrink-0">
              <div className="bg-[#14171c] rounded-[14px] p-3 shadow-2xl">
                <img
                  src="/lovable-uploads/d8bf89ab-4a7e-4d3a-b1d3-c492661136b6.png"
                  alt="justpae Logo"
                  className="w-10 h-10 object-contain"
                />
              </div>
            </div>
            <div className='text-left'>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Create Account
              </h2>
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-400 font-medium">
                Join justpae today
              </p>
            </div>
          </div>

          {/* This wrapper explicitly allows clicks to pass straight down to the child SignupForm */}
          <div className="bg-[#14171c]/80 backdrop-blur-xl py-6 px-4 sm:py-8 sm:px-10 shadow-2xl rounded-3xl border border-white/5 relative z-20 pointer-events-auto">
            <SignupForm />
          </div>
        </div>

      </div>
    </div>
  );
};

export default Signup;

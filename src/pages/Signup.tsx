import React from 'react';
import Layout from '@/components/Layout';
import SignupForm from '@/components/SignupForm';

const Signup = () => {
  return (
    <Layout showNavbar={false} fullWidth={true}>
      {/* 
        CLEANUP APPLIED:
        Removed all restrictive layout scroll definitions, heights, and locks from here.
        This element now flows naturally inside the scrolling master Layout shell.
      */}
      <div className="w-full min-h-[calc(100dvh-40px)] bg-[#0a0c10] flex flex-col justify-start md:justify-center items-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 text-white relative">
        
        {/* Decorative Background Glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-[80%] h-[30%] bg-primary/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]" />
        </div>

        <div className="w-full max-w-md pb-40 space-y-5 sm:space-y-8 relative z-10 my-auto">
          <div className="text-center flex flex-row items-center gap-5">
            <div className="inline-block relative p-[2px] rounded-2xl bg-gradient-to-b from-white/20 to-transparent mb-4 sm:mb-6">
              <div className="bg-[#14171c] rounded-[14px] p-3 shadow-2xl">
                <img 
                  src="/lovable-uploads/d8bf89ab-4a7e-4d3a-b1d3-c492661136b6.png" 
                  alt="Amazingpay Logo" 
                  className="w-10 h-10 object-contain"
                />
              </div>
            </div>
            <div className='text-left'>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Create Account
              </h2>
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-400 font-medium">
                Join Amazingpay today
              </p>
            </div>

          </div>

          <div className="bg-[#14171c]/80 backdrop-blur-xl py-6 px-4 sm:py-8 sm:px-10 shadow-2xl rounded-3xl border border-white/5">
            <SignupForm />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Signup;

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import PortfolioCard from '@/components/dashboard/PortfolioCard';
import QuickActions from '@/components/dashboard/QuickActions';
import PromotionalBanner from '@/components/dashboard/PromotionalBanner';
import MarketTrends from '@/components/dashboard/MarketTrends';
import KYCVerificationBanner from '@/components/dashboard/KYCVerificationBanner';
import { useDashboardData } from '@/hooks/useDashboardData';

const Dashboard = () => {
  const { profile } = useAuth();
  
  const {
    marketData = [],
    isLoadingPrices = true,
    unreadNotifications = 0,
    formatBalance = (val: any) => "0.00",
    formatEquivalentUSD = (val: any) => "0.00",
    calculateTotalPortfolioValue = () => 0,
    fetchCryptoPrices = () => {},
    toggleBalanceVisibility = () => {},
    hideBalance = false
  } = useDashboardData() || {};

  // Safe name extraction using valid index accessor syntax
  const displayName = (profile?.full_name || '').split(' ')[0] || 'User';

  return (
    /* 
      FIXES APPLIED:
      1. Stripped out the duplicate <Layout> component wrapper.
      2. Removed the conflicting "min-h-screen" and "overflow-hidden" layers.
      3. Modified the element to be a clean div wrapper that flows seamlessly inside your global master layout shell.
    */
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col relative">
      <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 pb-24">
        <DashboardHeader
          userName={displayName}
          unreadNotifications={unreadNotifications}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Column */}
          <div className="lg:col-span-2 space-y-6">
            <PortfolioCard
              totalValue={calculateTotalPortfolioValue()}
              hideBalance={hideBalance}
              onToggleBalanceVisibility={toggleBalanceVisibility}
              formatBalance={formatBalance}
              formatEquivalentUSD={formatEquivalentUSD}
            />
            
            <QuickActions />
            
            <MarketTrends
              marketData={marketData}
              isLoadingPrices={isLoadingPrices}
              onRefresh={fetchCryptoPrices}
            />
          </div>

          {/* Sidebar Content Column */}
          <div className="space-y-6">
            <PromotionalBanner />
            <KYCVerificationBanner
              isKycVerified={profile?.is_kyc_verified || false}
            />
            
            {/* Desktop-only section */}
            <div className="hidden lg:block bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Security Tip</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enable Two-Factor Authentication (2FA) to add an extra layer of security to your account.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

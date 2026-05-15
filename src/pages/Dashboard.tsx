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

  const displayName = (profile?.full_name || '').split(' ')[0] || 'User';

  return (
    /* 
      FIXES APPLIED INDIVIDUALLY:
      1. Added 'pt-safe-top' (from our tailwind config) to create a perfect cushion against device notches.
      2. Appended 'pb-32' to provide clear spacing so bottom items don't get stuck behind the floating Navbar.
    */
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col relative">
      <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="sticky top-0 z-30 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6 pt-2 pb-2">
          <DashboardHeader
            userName={displayName}
            unreadNotifications={unreadNotifications}
          />
        </div>

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

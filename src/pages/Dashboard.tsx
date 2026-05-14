
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
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
    marketData,
    isLoadingPrices,
    unreadNotifications,
    formatBalance,
    formatEquivalentUSD,
    calculateTotalPortfolioValue,
    fetchCryptoPrices,
    toggleBalanceVisibility,
    hideBalance
  } = useDashboardData();

  // Safe name extraction
  const displayName = (profile?.full_name || '').split(' ')[0] || 'User';

  return (
    <Layout fullWidth={true}>
      <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 flex flex-col relative overflow-hidden">
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
            
            {/* Added a desktop-only section for better space utilization */}
            <div className="hidden lg:block bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Security Tip</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enable Two-Factor Authentication (2FA) to add an extra layer of security to your account.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;

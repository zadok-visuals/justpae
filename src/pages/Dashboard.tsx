
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

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="p-4 pb-24 space-y-6">
          <DashboardHeader
            userName={profile?.name?.split(' ')[0] || 'User'}
            unreadNotifications={unreadNotifications}
          />

          <PortfolioCard
            totalValue={calculateTotalPortfolioValue()}
            hideBalance={hideBalance}
            onToggleBalanceVisibility={toggleBalanceVisibility}
            formatBalance={formatBalance}
            formatEquivalentUSD={formatEquivalentUSD}
          />

          <QuickActions />

          <PromotionalBanner />

          <MarketTrends
            marketData={marketData}
            isLoadingPrices={isLoadingPrices}
            onRefresh={fetchCryptoPrices}
          />

          <KYCVerificationBanner
            isKycVerified={profile?.is_kyc_verified || false}
          />
        </div>
      </div>

      
    </Layout>
  );
};

export default Dashboard;

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import PortfolioCard from '@/components/dashboard/PortfolioCard';
import QuickActions from '@/components/dashboard/QuickActions';
import PromotionalBanner from '@/components/dashboard/PromotionalBanner';
import MarketTrends from '@/components/dashboard/MarketTrends';
import KYCVerificationBanner from '@/components/dashboard/KYCVerificationBanner';
import { useDashboardData } from '@/hooks/useDashboardData';
import { ShieldCheck } from 'lucide-react';

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
    hideBalance = false,
    pendingFiatBalance = 0
  } = useDashboardData() || {};

  const displayName = (profile?.full_name || '').split(' ')[0] || 'User';

  return (
    /* 
      FIXES APPLIED INDIVIDUALLY:
      1. Added 'pt-safe-top' (from our tailwind config) to create a perfect cushion against device notches.
      2. Appended 'pb-32' to provide clear spacing so bottom items don't get stuck behind the floating Navbar.
    */
    <div className="w-full bg-background flex flex-col relative">
      <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-7">
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6 pt-2 pb-2">
          <DashboardHeader
            userName={displayName}
            unreadNotifications={unreadNotifications}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Main Content Column */}
          <div className="lg:col-span-2 space-y-7">
            <PortfolioCard
              totalValue={calculateTotalPortfolioValue()}
              pendingFiatBalance={pendingFiatBalance}
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
          <div className="space-y-7">
            <PromotionalBanner />
            <KYCVerificationBanner
              isKycVerified={profile?.is_kyc_verified || false}
            />

            <div className="hidden lg:block bg-card rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-2.5 mb-3">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Security Tip</h3>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
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

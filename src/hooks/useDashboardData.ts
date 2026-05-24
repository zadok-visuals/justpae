
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { cryptoService, CryptoPrice } from '@/services/cryptoService';
import { supabase } from '@/integrations/supabase/client';

export const useDashboardData = () => {
  const { profile, user } = useAuth();
  const { fiatBalance, pendingFiatBalance, cryptoBalances, hideBalance, toggleBalanceVisibility } = useWallet();
  const [marketData, setMarketData] = useState<CryptoPrice[]>([]);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(1650);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const formatBalance = (amount: number) => {
    if (hideBalance) return '****';
    return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const formatEquivalentUSD = (nairaAmount: number) => {
    if (hideBalance) return '****';
    return `≈ $${(nairaAmount / exchangeRate).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const calculateTotalPortfolioValue = () => {
    const fiatInNaira = fiatBalance;
    const cryptoInNaira = cryptoBalances.reduce((sum, crypto) => {
      return sum + (crypto.usdValue * exchangeRate);
    }, 0);
    return fiatInNaira + cryptoInNaira;
  };

  const fetchCryptoPrices = async () => {
    setIsLoadingPrices(true);
    try {
      const { prices, exchangeRate: currentRate } = await cryptoService.getCombinedPrices();
      setMarketData(prices);
      setExchangeRate(currentRate);
      console.log('Updated crypto prices and exchange rate:', { prices, exchangeRate: currentRate });
    } catch (error) {
      console.error('Error fetching crypto prices:', error);
    } finally {
      setIsLoadingPrices(false);
    }
  };

  const fetchUnreadNotifications = async () => {
    if (!user) return;

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
      setUnreadNotifications(count || 0);
    } catch (error) {
      console.error('Error fetching unread notifications:', error);
    }
  };

  useEffect(() => {
    fetchCryptoPrices();
    fetchUnreadNotifications();
    
    const interval = setInterval(() => {
      fetchCryptoPrices();
      fetchUnreadNotifications();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [user]);

  return {
    profile,
    marketData,
    isLoadingPrices,
    exchangeRate,
    unreadNotifications,
    hideBalance,
    formatBalance,
    formatEquivalentUSD,
    calculateTotalPortfolioValue,
    fetchCryptoPrices,
    toggleBalanceVisibility,
    pendingFiatBalance
  };
};

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AdminStats {
  totalUsers: number;
  pendingTransactions: number;
  totalRevenue: number;
  pendingKyc: number;
  pendingGiftCards: number;
}

export const useAdminStats = () => {
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    pendingTransactions: 0,
    totalRevenue: 0,
    pendingKyc: 0,
    pendingGiftCards: 0
  });
  const { toast } = useToast();

  const fetchDashboardStats = async () => {
    try {
      console.log('Fetching dashboard stats...');

      // Use service role or admin context to bypass RLS for counting
      const { data: allUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id, created_at, is_kyc_verified');

      if (usersError) {
        console.error('Error fetching users:', usersError);
      }

      const totalUsers = allUsers?.length || 0;
      const pendingKyc = allUsers?.filter(user => !user.is_kyc_verified).length || 0;

      console.log('User stats:', { totalUsers, pendingKyc, allUsers });

      // Fetch pending transactions
      const { data: pendingTransactions, error: transactionsError } = await supabase
        .from('transactions')
        .select('id')
        .eq('status', 'pending');

      if (transactionsError) {
        console.error('Error fetching transactions:', transactionsError);
      }

      // Fetch completed transactions for revenue
      const { data: completedTransactions, error: revenueError } = await supabase
        .from('transactions')
        .select('fiat_amount')
        .eq('status', 'completed')
        .eq('type', 'buy');

      if (revenueError) {
        console.error('Error fetching revenue:', revenueError);
      }

      const totalRevenue = completedTransactions?.reduce((sum, tx) => sum + (tx.fiat_amount || 0), 0) || 0;

      // Fetch pending gift cards
      const { data: pendingGiftCards, error: giftCardError } = await supabase
        .from('gift_card_transactions')
        .select('id')
        .eq('status', 'pending');

      if (giftCardError) {
        console.error('Error fetching gift cards:', giftCardError);
      }

      const newStats = {
        totalUsers,
        pendingTransactions: pendingTransactions?.length || 0,
        totalRevenue,
        pendingKyc,
        pendingGiftCards: pendingGiftCards?.length || 0
      };

      console.log('Updated stats:', newStats);
      setStats(newStats);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      toast({
        title: "Error",
        description: "Failed to fetch dashboard statistics",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchDashboardStats();
    // Refresh stats every 30 seconds to keep badges updated
    const interval = setInterval(fetchDashboardStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return {
    stats,
    fetchDashboardStats
  };
};

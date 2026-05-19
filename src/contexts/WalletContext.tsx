
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

interface CryptoBalance {
  symbol: string;
  name: string;
  amount: number;
  usdValue: number;
  priceChange24h: number;
}

interface Transaction {
  id: string;
  type: 'buy' | 'sell' | 'deposit' | 'withdrawal' | 'transfer';
  asset?: string;
  amount: number;
  fiat_amount: number;
  fiat_currency: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  description?: string;
  reference?: string;
}

interface WalletContextType {
  fiatBalance: number;
  cryptoBalances: CryptoBalance[];
  totalPortfolioValue: number;
  updateFiatBalance: (amount: number) => void;
  updateCryptoBalance: (symbol: string, amount: number) => void;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'timestamp'>) => Promise<{ success: boolean; error?: string }>;
  transactions: Transaction[];
  depositFiat: (amount: number, paymentMethod: string) => Promise<{ success: boolean; reference?: string; error?: string }>;
  withdrawFiat: (amount: number, bankAccount: string) => Promise<{ success: boolean; reference?: string; error?: string }>;
  hideBalance: boolean;
  toggleBalanceVisibility: () => void;
  loading: boolean;
  refreshData: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [fiatBalance, setFiatBalance] = useState(0);
  const [hideBalance, setHideBalance] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cryptoBalances, setCryptoBalances] = useState<CryptoBalance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const totalPortfolioValue = fiatBalance + cryptoBalances.reduce((sum, crypto) => sum + crypto.usdValue, 0);

  // Fetch wallet data from Supabase
  const fetchWalletData = async () => {
    if (!user || !isAuthenticated) return;

    try {
      setLoading(true);

      // Fetch fiat balance
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('balance, currency')
        .eq('user_id', user.id)
        .eq('currency', 'NGN')
        .maybeSingle();

      if (walletError && walletError.code !== 'PGRST116') {
        console.error('Error fetching wallet:', walletError);
      } else if (walletData) {
        setFiatBalance(walletData.balance || 0);
      }

      // Fetch crypto holdings
      const { data: cryptoData, error: cryptoError } = await supabase
        .from('crypto_holdings')
        .select('*')
        .eq('user_id', user.id);

      if (cryptoError) {
        console.error('Error fetching crypto holdings:', cryptoError);
      } else {
        const cryptoBalances: CryptoBalance[] = cryptoData?.map(holding => ({
          symbol: holding.symbol,
          name: holding.name,
          amount: holding.amount,
          usdValue: holding.amount * (holding.current_price_usd || 0),
          priceChange24h: 0 // Would need external API for real price changes
        })) || [];
        setCryptoBalances(cryptoBalances);
      }

      // Fetch transactions
      const { data: transactionData, error: transactionError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (transactionError) {
        console.error('Error fetching transactions:', transactionError);
      } else {
        const transactions: Transaction[] = transactionData?.map(tx => ({
          id: tx.id,
          type: tx.type as 'buy' | 'sell' | 'deposit' | 'withdrawal' | 'transfer',
          asset: tx.asset,
          amount: tx.amount,
          fiat_amount: tx.fiat_amount,
          fiat_currency: tx.fiat_currency,
          timestamp: new Date(tx.created_at),
          status: tx.status as 'pending' | 'completed' | 'failed' | 'cancelled',
          description: tx.description,
          reference: tx.reference
        })) || [];
        setTransactions(transactions);
      }

    } catch (error) {
      console.error('Error fetching wallet data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchWalletData();
    } else {
      // Reset data when user logs out
      setFiatBalance(0);
      setCryptoBalances([]);
      setTransactions([]);
    }
  }, [isAuthenticated, user]);

  const refreshData = async () => {
    await fetchWalletData();
  };

  const updateFiatBalance = async (amount: number) => {
    if (!user) return;

    const newBalance = fiatBalance + amount;
    setFiatBalance(newBalance);

    // Update in database
    try {
      const { error } = await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('user_id', user.id)
        .eq('currency', 'NGN');

      if (error) {
        console.error('Error updating balance:', error);
        // Revert local state if database update fails
        setFiatBalance(fiatBalance);
      }
    } catch (error) {
      console.error('Error updating balance:', error);
      setFiatBalance(fiatBalance);
    }
  };

  const updateCryptoBalance = (symbol: string, amount: number) => {
    setCryptoBalances(prev => 
      prev.map(crypto => 
        crypto.symbol === symbol 
          ? { ...crypto, amount: crypto.amount + amount }
          : crypto
      )
    );
  };

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'timestamp'>): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'User not authenticated' };

    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          type: transaction.type,
          asset: transaction.asset,
          amount: transaction.amount,
          fiat_amount: transaction.fiat_amount,
          fiat_currency: transaction.fiat_currency,
          status: transaction.status,
          description: transaction.description,
          reference: transaction.reference
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding transaction:', error);
        return { success: false, error: error.message };
      }

      // Add to local state
      const newTransaction: Transaction = {
        id: data.id,
        type: transaction.type,
        asset: transaction.asset,
        amount: transaction.amount,
        fiat_amount: transaction.fiat_amount,
        fiat_currency: transaction.fiat_currency,
        timestamp: new Date(data.created_at),
        status: transaction.status,
        description: transaction.description,
        reference: transaction.reference
      };

      setTransactions(prev => [newTransaction, ...prev]);
      return { success: true };
    } catch (error) {
      console.error('Error adding transaction:', error);
      return { success: false, error: 'Failed to add transaction' };
    }
  };

  const toggleBalanceVisibility = () => {
    setHideBalance(prev => !prev);
  };

  // Updated depositFiat - only creates transaction record, no balance update until payment is verified
  const depositFiat = async (amount: number, paymentMethod: string): Promise<{ success: boolean; reference?: string; error?: string }> => {
    if (!user) return { success: false, error: 'User not authenticated' };

    try {
      const reference = `DEP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Only add transaction record - do not update balance yet
      const result = await addTransaction({
        type: 'deposit',
        amount: amount,
        fiat_amount: amount,
        fiat_currency: 'NGN',
        status: 'pending',
        description: `Fiat Deposit via ${paymentMethod}`,
        reference: reference
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Note: Balance will only be updated when payment provider confirms the transaction
      console.log(`Deposit request of ₦${amount.toLocaleString()} created successfully. Awaiting payment verification.`);

      return { success: true, reference };
    } catch (error) {
      console.error('Deposit failed:', error);
      return { success: false, error: 'Deposit failed. Please try again.' };
    }
  };

  const withdrawFiat = async (amount: number, bankAccount: string): Promise<{ success: boolean; reference?: string; error?: string }> => {
    if (!user) return { success: false, error: 'User not authenticated' };

    try {
      if (amount > fiatBalance) {
        return { success: false, error: 'Insufficient balance' };
      }

      const reference = `WTH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Add transaction record
      const result = await addTransaction({
        type: 'withdrawal',
        amount: -amount,
        fiat_amount: amount,
        fiat_currency: 'NGN',
        status: 'pending',
        description: `Withdrawal to ${bankAccount}`,
        reference: reference
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Deduct amount immediately (pending withdrawal)
      await updateFiatBalance(-amount);

      return { success: true, reference };
    } catch (error) {
      console.error('Withdrawal failed:', error);
      return { success: false, error: 'Withdrawal failed. Please try again.' };
    }
  };

  return (
    <WalletContext.Provider value={{
      fiatBalance,
      cryptoBalances,
      totalPortfolioValue,
      updateFiatBalance,
      updateCryptoBalance,
      addTransaction,
      transactions,
      depositFiat,
      withdrawFiat,
      hideBalance,
      toggleBalanceVisibility,
      loading,
      refreshData
    }}>
      {children}
    </WalletContext.Provider>
  );
};

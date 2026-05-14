
import React, { useState, useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import WalletHeader from '@/components/wallet/WalletHeader';
import TransactionFilters from '@/components/wallet/TransactionFilters';
import TransactionList from '@/components/wallet/TransactionList';
import { Tabs, TabsContent } from '@/components/ui/tabs';

interface Transaction {
  id: string;
  type: 'buy' | 'sell' | 'deposit' | 'withdrawal' | 'transfer' | 'giftcard';
  asset?: string;
  amount: number;
  fiat_amount: number;
  fiat_currency: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  description?: string;
  reference?: string;
}

const Wallet = () => {
  const { transactions } = useWallet();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [giftCardTransactions, setGiftCardTransactions] = useState([]);

  const formatCurrency = (amount: number, currency: string = 'NGN') => {
    if (currency === 'NGN') {
      return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (currency === 'USD') {
      return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Fetch gift card transactions
  useEffect(() => {
    const fetchGiftCardTransactions = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('gift_card_transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching gift card transactions:', error);
        } else {
          setGiftCardTransactions(data || []);
        }
      } catch (error) {
        console.error('Error fetching gift card transactions:', error);
      }
    };

    fetchGiftCardTransactions();
  }, [user]);

  // Remove mock gift card transactions - only show real user transactions
  const allTransactions = transactions.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const getFilteredTransactions = (): Transaction[] => {
    switch (activeTab) {
      case 'deposits':
        return allTransactions.filter(t => t.type === 'deposit');
      case 'withdrawals':
        return allTransactions.filter(t => t.type === 'withdrawal');
      case 'crypto':
        return allTransactions.filter(t => t.type === 'buy' || t.type === 'sell');
      case 'giftcards':
        return giftCardTransactions.map(gc => ({
          id: gc.id,
          type: 'giftcard' as const,
          amount: gc.card_value,
          fiat_amount: gc.card_value,
          fiat_currency: 'USD',
          timestamp: new Date(gc.created_at),
          status: gc.status as 'pending' | 'completed' | 'failed' | 'cancelled',
          description: `${gc.card_type} Gift Card - $${gc.card_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        }));
      default:
        const giftCardMapped: Transaction[] = giftCardTransactions.map(gc => ({
          id: gc.id,
          type: 'giftcard' as const,
          amount: gc.card_value,
          fiat_amount: gc.card_value,
          fiat_currency: 'USD',
          timestamp: new Date(gc.created_at),
          status: gc.status as 'pending' | 'completed' | 'failed' | 'cancelled',
          description: `${gc.card_type} Gift Card - $${gc.card_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        }));
        
        return [...allTransactions, ...giftCardMapped].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }
  };

  return (
      <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 flex flex-col relative overflow-hidden">
        <div className="flex-1 w-full max-w-4xl mx-auto p-4 pb-24 space-y-6">
          <WalletHeader />
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TransactionFilters 
              activeTab={activeTab} 
              onTabChange={setActiveTab} 
            />
            
            <TabsContent value="all" className="mt-4">
              <TransactionList
                activeTab="all"
                transactions={getFilteredTransactions()}
                formatCurrency={formatCurrency}
              />
            </TabsContent>
            
            <TabsContent value="deposits" className="mt-4">
              <TransactionList
                activeTab="deposits"
                transactions={getFilteredTransactions()}
                formatCurrency={formatCurrency}
              />
            </TabsContent>
            
            <TabsContent value="withdrawals" className="mt-4">
              <TransactionList
                activeTab="withdrawals"
                transactions={getFilteredTransactions()}
                formatCurrency={formatCurrency}
              />
            </TabsContent>
            
            <TabsContent value="crypto" className="mt-4">
              <TransactionList
                activeTab="crypto"
                transactions={getFilteredTransactions()}
                formatCurrency={formatCurrency}
              />
            </TabsContent>
            
            <TabsContent value="giftcards" className="mt-4">
              <TransactionList
                activeTab="giftcards"
                transactions={getFilteredTransactions()}
                formatCurrency={formatCurrency}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

  );
};

export default Wallet;

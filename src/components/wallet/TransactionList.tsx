
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard } from 'lucide-react';
import TransactionItem from './TransactionItem';

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

interface TransactionListProps {
  activeTab: string;
  transactions: Transaction[];
  formatCurrency: (amount: number, currency?: string) => string;
}

const TransactionList: React.FC<TransactionListProps> = ({
  activeTab,
  transactions,
  formatCurrency
}) => {
  const getTabTitle = () => {
    switch (activeTab) {
      case 'all':
        return 'All Transactions';
      case 'deposits':
        return 'Deposits';
      case 'withdrawals':
        return 'Withdrawals';
      case 'crypto':
        return 'Crypto Transactions';
      case 'giftcards':
        return 'Gift Card Transactions';
      default:
        return 'Transactions';
    }
  };

  return (
    <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-gray-900 dark:text-white">
          {getTabTitle()}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
              <CreditCard className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No transactions yet</h3>
            <p className="text-gray-500 dark:text-gray-400">Your transaction history will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((transaction) => (
              <TransactionItem
                key={transaction.id}
                transaction={transaction}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TransactionList;

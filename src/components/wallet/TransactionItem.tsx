
import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Bitcoin, Gift, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { giftCardTypes } from '@/components/gift-cards/types';

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

interface TransactionItemProps {
  transaction: Transaction;
  formatCurrency: (amount: number, currency?: string) => string;
}

const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction,
  formatCurrency
}) => {
  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownLeft className="w-4 h-4 text-green-600" />;
      case 'withdrawal':
        return <ArrowUpRight className="w-4 h-4 text-red-600" />;
      case 'buy':
        return <Bitcoin className="w-4 h-4 text-fintech-orange" />;
      case 'sell':
        return <Bitcoin className="w-4 h-4 text-fintech-orange" />;
      case 'giftcard':
        return <Gift className="w-4 h-4 text-purple-600" />;
      default:
        return <CreditCard className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'deposit':
        return 'text-green-600';
      case 'withdrawal':
        return 'text-red-600';
      case 'buy':
        return 'text-fintech-orange';
      case 'sell':
        return 'text-fintech-orange';
      case 'giftcard':
        return 'text-purple-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatTransactionType = (type: string) => {
    switch (type) {
      case 'deposit':
        return 'Deposit';
      case 'withdrawal':
        return 'Withdrawal';
      case 'buy':
        return 'Crypto Buy';
      case 'sell':
        return 'Crypto Sell';
      case 'giftcard':
        return 'Gift Card Sale';
      default:
        return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'failed':
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getGiftCardRate = (description?: string) => {
    if (!description || transaction.type !== 'giftcard') return null;
    
    // Extract card type from description
    const cardType = description.split(' Gift Card')[0];
    const card = giftCardTypes.find(c => 
      c.name.toLowerCase() === cardType.toLowerCase() || 
      c.id.toLowerCase() === cardType.toLowerCase()
    );
    return card?.rate || null;
  };

  const rate = getGiftCardRate(transaction.description);

  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-sm">
            {getTransactionIcon(transaction.type)}
          </div>
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <h4 className="font-semibold text-gray-900 dark:text-white">
                {formatTransactionType(transaction.type)}
              </h4>
              <Badge className={getStatusColor(transaction.status)}>
                {transaction.status}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {transaction.type === 'giftcard' && rate
                ? `${transaction.description} • ${rate}% rate`
                : transaction.description || `${transaction.type} transaction`
              }
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(transaction.timestamp).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-semibold ${getTransactionColor(transaction.type)}`}>
            {transaction.type === 'withdrawal' || transaction.type === 'buy' ? '-' : ''}
            {transaction.type === 'giftcard' 
              ? formatCurrency(Math.abs(transaction.fiat_amount), 'USD')
              : formatCurrency(Math.abs(transaction.fiat_amount), 'NGN')
            }
          </p>
          {transaction.type === 'giftcard' && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ₦{(Math.abs(transaction.fiat_amount) * 1650 * ((rate || 80) / 100)).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionItem;

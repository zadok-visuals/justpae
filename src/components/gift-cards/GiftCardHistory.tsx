
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, Gift } from 'lucide-react';
import { GiftCardTransaction, giftCardTypes, formatCurrency } from './types';

interface GiftCardHistoryProps {
  transactions: GiftCardTransaction[];
  loading: boolean;
}

const GiftCardHistory: React.FC<GiftCardHistoryProps> = ({ transactions, loading }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getCardRate = (cardType: string) => {
    const card = giftCardTypes.find(c => 
      c.name.toLowerCase() === cardType.toLowerCase() || 
      c.id.toLowerCase() === cardType.toLowerCase()
    );
    return card?.rate || 0;
  };

  if (loading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <History className="w-6 h-6 text-fintech-orange" />
            <CardTitle className="text-xl text-gray-900 dark:text-white">Transaction History</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded-lg"></div>
                    <div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-32 mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-24"></div>
                    </div>
                  </div>
                  <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-20"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <History className="w-6 h-6 text-fintech-orange" />
          <CardTitle className="text-xl text-gray-900 dark:text-white">Transaction History</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Gift className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No transactions yet</h3>
            <p className="text-gray-500 dark:text-gray-400">Your gift card transactions will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((transaction) => {
              const rate = getCardRate(transaction.card_type);
              const exchangeRate = 1650; // USD to NGN rate
              const nairaEquivalent = Math.round(transaction.card_value * exchangeRate * (rate / 100));
              
              return (
                <div
                  key={transaction.id}
                  className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-fintech-orange/10 rounded-lg flex items-center justify-center">
                        <Gift className="w-6 h-6 text-fintech-orange" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {transaction.card_type}
                          </h4>
                          <Badge className={getStatusColor(transaction.status)}>
                            {transaction.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          ${transaction.card_value} • {rate}% rate • {formatCurrency(nairaEquivalent, 'NGN')}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(transaction.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-fintech-orange">
                        ${transaction.card_value}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {formatCurrency(nairaEquivalent, 'NGN')}
                      </div>
                    </div>
                  </div>
                  {transaction.admin_notes && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border-l-4 border-blue-400">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        <strong>Admin Note:</strong> {transaction.admin_notes}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GiftCardHistory;

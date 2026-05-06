
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Trash2, Download } from 'lucide-react';
import { GiftCardTransaction } from './types';
import ProcessingModal from '@/components/ui/processing-modal';

interface GiftCardListProps {
  transactions: GiftCardTransaction[];
  loading: boolean;
  onTransactionSelect: (transaction: GiftCardTransaction) => void;
  onDeleteTransaction?: (transactionId: string) => void;
  onDownloadHistory?: () => void;
  deletingTransaction?: string | null;
  processingAction?: boolean;
}

const GiftCardList: React.FC<GiftCardListProps> = ({ 
  transactions, 
  loading, 
  onTransactionSelect,
  onDeleteTransaction,
  onDownloadHistory,
  deletingTransaction,
  processingAction
}) => {
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

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 animate-pulse">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Gift Card Transactions</h3>
          {onDownloadHistory && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadHistory}
              disabled={processingAction}
            >
              <Download className="w-4 h-4 mr-2" />
              Download History
            </Button>
          )}
        </div>
        
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                  <img
                    src={transaction.image_url}
                    alt="Gift Card"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yNCAyNEg0MFY0MEgyNFYyNFoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
                    }}
                  />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    {transaction.card_type} Gift Card
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Value: ${transaction.card_value} • User: {transaction.profiles?.name} ({transaction.profiles?.email})
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Submitted: {new Date(transaction.created_at).toLocaleDateString()} at{' '}
                    {new Date(transaction.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Badge className={getStatusColor(transaction.status)}>
                  {transaction.status}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onTransactionSelect(transaction)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Review
                </Button>
                {(transaction.status === 'completed' || transaction.status === 'approved') && onDeleteTransaction && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDeleteTransaction(transaction.id)}
                    disabled={deletingTransaction === transaction.id}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deletingTransaction === transaction.id ? 'Deleting...' : 'Delete'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <ProcessingModal 
        isOpen={!!deletingTransaction || (processingAction || false)}
        message={deletingTransaction ? "Deleting transaction..." : "Processing request..."}
      />
    </>
  );
};

export default GiftCardList;

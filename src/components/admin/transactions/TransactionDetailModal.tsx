
import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle } from 'lucide-react';
import { TransactionDetailModalProps } from './types';

const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  isOpen,
  onClose,
  adminNotes,
  setAdminNotes,
  onAction,
  processingAction
}) => {
  if (!transaction) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">Transaction Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Transaction ID</label>
              <p className="text-gray-900 dark:text-white">{transaction.id}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">User</label>
              <p className="text-gray-900 dark:text-white">{transaction.profiles?.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Type</label>
              <p className="text-gray-900 dark:text-white capitalize">{transaction.type}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Amount</label>
              <p className="text-gray-900 dark:text-white">₦{transaction.fiat_amount.toLocaleString()}</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Admin Notes</label>
            <Textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Add notes about this transaction..."
              className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {transaction.status === 'pending' && (
            <div className="flex space-x-3">
              <Button
                onClick={() => onAction(transaction.id, 'approve')}
                disabled={processingAction}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve
              </Button>
              <Button
                onClick={() => onAction(transaction.id, 'reject')}
                disabled={processingAction}
                variant="destructive"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionDetailModal;


import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GiftCardTransaction } from './types';
import GiftCardDetails from './GiftCardDetails';
import GiftCardImage from './GiftCardImage';
import AdminNotesSection from './AdminNotesSection';
import ReviewActionButtons from './ReviewActionButtons';

interface GiftCardReviewModalProps {
  transaction: GiftCardTransaction | null;
  isOpen: boolean;
  onClose: () => void;
  adminNotes: string;
  setAdminNotes: (notes: string) => void;
  onAction: (transactionId: string, action: 'approve' | 'reject') => Promise<void>;
  processingAction: boolean;
}

const GiftCardReviewModal: React.FC<GiftCardReviewModalProps> = ({
  transaction,
  isOpen,
  onClose,
  adminNotes,
  setAdminNotes,
  onAction,
  processingAction
}) => {
  if (!transaction) return null;

  const handleApprove = () => {
    onAction(transaction.id, 'approve');
  };

  const handleReject = () => {
    onAction(transaction.id, 'reject');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl text-gray-900 dark:text-white">
            Review Gift Card Submission
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GiftCardDetails transaction={transaction} />
            <GiftCardImage imageUrl={transaction.image_url} />
          </div>

          <AdminNotesSection 
            adminNotes={adminNotes}
            setAdminNotes={setAdminNotes}
          />

          <ReviewActionButtons
            onApprove={handleApprove}
            onReject={handleReject}
            onCancel={onClose}
            processingAction={processingAction}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GiftCardReviewModal;

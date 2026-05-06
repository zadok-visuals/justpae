
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gift } from 'lucide-react';
import GiftCardStats from './giftcards/GiftCardStats';
import GiftCardList from './giftcards/GiftCardList';
import GiftCardReviewModal from './giftcards/GiftCardReviewModal';
import GiftCardEmptyState from './giftcards/GiftCardEmptyState';
import { useGiftCardManagement } from '@/hooks/useGiftCardManagement';

interface GiftCardManagementProps {
  onStatsUpdate?: () => void;
}

const GiftCardManagement: React.FC<GiftCardManagementProps> = ({ onStatsUpdate }) => {
  const {
    giftCardTransactions,
    loading,
    selectedTransaction,
    isModalOpen,
    adminNotes,
    processingAction,
    deletingTransaction,
    setAdminNotes,
    handleTransactionSelect,
    handleTransactionAction,
    handleTransactionDelete,
    handleCloseModal,
    downloadTransactionHistory
  } = useGiftCardManagement(onStatsUpdate);

  const stats = {
    totalTransactions: giftCardTransactions.length,
    pendingTransactions: giftCardTransactions.filter(t => t.status === 'pending').length,
    approvedTransactions: giftCardTransactions.filter(t => t.status === 'completed').length,
    rejectedTransactions: giftCardTransactions.filter(t => t.status === 'rejected').length,
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Gift className="w-6 h-6 text-fintech-orange" />
            <CardTitle className="text-xl text-gray-900 dark:text-white">Gift Card Management</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <GiftCardStats stats={stats} />

          {giftCardTransactions.length === 0 ? (
            <GiftCardEmptyState loading={loading} />
          ) : (
            <GiftCardList
              transactions={giftCardTransactions}
              loading={loading}
              onTransactionSelect={handleTransactionSelect}
              onDeleteTransaction={handleTransactionDelete}
              onDownloadHistory={downloadTransactionHistory}
              deletingTransaction={deletingTransaction}
              processingAction={processingAction}
            />
          )}
        </CardContent>
      </Card>

      <GiftCardReviewModal
        transaction={selectedTransaction}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        adminNotes={adminNotes}
        setAdminNotes={setAdminNotes}
        onAction={handleTransactionAction}
        processingAction={processingAction}
      />
    </div>
  );
};

export default GiftCardManagement;

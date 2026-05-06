
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import TransactionFilters from './transactions/TransactionFilters';
import TransactionList from './transactions/TransactionList';
import TransactionDetailModal from './transactions/TransactionDetailModal';
import TransactionManagementHeader from './transactions/TransactionManagementHeader';
import { useTransactionManagement } from '@/hooks/useTransactionManagement';

interface TransactionManagementProps {
  onStatsUpdate?: () => void;
}

const TransactionManagement: React.FC<TransactionManagementProps> = ({ onStatsUpdate }) => {
  const {
    transactions,
    loading,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    selectedTransaction,
    isModalOpen,
    adminNotes,
    setAdminNotes,
    processingAction,
    cleaningPending,
    downloading,
    handleTransactionSelect,
    handleTransactionAction,
    handleCloseModal,
    cleanupPendingTransactions,
    downloadTransactions
  } = useTransactionManagement(onStatsUpdate);

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <TransactionManagementHeader
          cleaningPending={cleaningPending}
          downloading={downloading}
          onCleanupConfirm={cleanupPendingTransactions}
          onDownload={downloadTransactions}
        />
        <CardContent className="space-y-6">
          <TransactionFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />

          <TransactionList
            transactions={transactions}
            loading={loading}
            onTransactionSelect={handleTransactionSelect}
          />
        </CardContent>
      </Card>

      <TransactionDetailModal
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

export default TransactionManagement;

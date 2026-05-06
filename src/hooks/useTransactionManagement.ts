
import { useTransactionData } from './useTransactionData';
import { useTransactionActions } from './useTransactionActions';

export const useTransactionManagement = (onStatsUpdate?: () => void) => {
  const {
    transactions,
    loading,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    setTransactions,
    fetchTransactions
  } = useTransactionData();

  const {
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
  } = useTransactionActions({
    fetchTransactions,
    setTransactions,
    onStatsUpdate
  });

  return {
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
    downloadTransactions,
    fetchTransactions
  };
};

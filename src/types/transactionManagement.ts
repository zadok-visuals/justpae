
export interface TransactionManagementState {
  transactions: any[];
  filteredTransactions: any[];
  loading: boolean;
  searchTerm: string;
  statusFilter: string;
  selectedTransaction: any | null;
  isModalOpen: boolean;
  adminNotes: string;
  processingAction: boolean;
  cleaningPending: boolean;
  downloading: boolean;
}

export interface TransactionManagementActions {
  setSearchTerm: (term: string) => void;
  setStatusFilter: (status: string) => void;
  setAdminNotes: (notes: string) => void;
  handleTransactionSelect: (transaction: any) => void;
  handleTransactionAction: (transactionId: string, action: 'approve' | 'reject') => void;
  handleCloseModal: () => void;
  cleanupPendingTransactions: () => void;
  downloadTransactions: () => void;
  fetchTransactions: () => void;
}

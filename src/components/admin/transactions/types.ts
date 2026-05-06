
export interface Transaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  fiat_amount: number;
  status: string;
  created_at: string;
  profiles: { name: string; email: string };
  admin_notes?: string;
}

export interface TransactionFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
}

export interface TransactionListProps {
  transactions: Transaction[];
  loading: boolean;
  onTransactionSelect: (transaction: Transaction) => void;
}

export interface TransactionDetailModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  adminNotes: string;
  setAdminNotes: (notes: string) => void;
  onAction: (transactionId: string, action: 'approve' | 'reject') => void;
  processingAction: boolean;
}

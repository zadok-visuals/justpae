import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { transactionManagementService } from '@/services/transactionManagementService';

interface UseTransactionActionsProps {
  fetchTransactions: () => void;
  setTransactions: (transactions: any[]) => void;
  onStatsUpdate?: () => void;
}

export const useTransactionActions = ({ 
  fetchTransactions, 
  setTransactions, 
  onStatsUpdate 
}: UseTransactionActionsProps) => {
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [processingAction, setProcessingAction] = useState(false);
  const [cleaningPending, setCleaningPending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleTransactionSelect = (transaction: any) => {
    setSelectedTransaction(transaction);
    setAdminNotes(transaction.admin_notes || '');
    setIsModalOpen(true);
  };

  const handleTransactionAction = async (transactionId: string, action: 'approve' | 'reject') => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to perform this action.",
        variant: "destructive",
      });
      return;
    }

    setProcessingAction(true);
    try {
      console.log('Processing transaction action:', { transactionId, action, adminNotes, userId: user.id });

      const newStatus = action === 'approve' ? 'completed' : 'failed';
      
      await transactionManagementService.updateTransaction(transactionId, {
        status: newStatus,
        admin_notes: adminNotes,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString()
      });

      toast({
        title: "Success",
        description: `Transaction ${action}d successfully.`,
      });
      
      await fetchTransactions();
      
      if (onStatsUpdate) {
        onStatsUpdate();
      }
      
      setIsModalOpen(false);
      setSelectedTransaction(null);
    } catch (error: any) {
      console.error('Error processing transaction action:', error);
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred while processing the transaction.",
        variant: "destructive",
      });
    } finally {
      setProcessingAction(false);
    }
  };

  const cleanupPendingTransactions = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to perform this action.",
        variant: "destructive",
      });
      return;
    }

    setCleaningPending(true);
    try {
      console.log('Starting cleanup of pending transactions...');
      
      const deletedCount = await transactionManagementService.deletePendingTransactions(user.id);

      if (deletedCount === 0) {
        toast({
          title: "Info",
          description: "No pending transactions found to delete.",
        });
      } else {
        toast({
          title: "Success",
          description: `Successfully deleted ${deletedCount} pending transactions.`,
        });
        
        // Refresh data to ensure consistency
        setTimeout(async () => {
          await fetchTransactions();
          if (onStatsUpdate) {
            onStatsUpdate();
          }
        }, 1000);
      }
      
    } catch (error: any) {
      console.error('Error in cleanupPendingTransactions:', error);
      let description = error.message || "Failed to delete pending transactions.";
      if (error.message && error.message.includes('admin_actions_admin_user_id_fkey')) {
        description = "Cleanup failed. You may not have the required admin permissions to perform this action.";
      }
      toast({
        title: "Error",
        description: description,
        variant: "destructive",
      });
    } finally {
      setCleaningPending(false);
    }
  };

  const downloadTransactions = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to download transactions.",
        variant: "destructive",
      });
      return;
    }

    setDownloading(true);
    try {
      console.log('Starting transaction download...');
      
      await transactionManagementService.verifyAdminStatus(user.id);
      const data = await transactionManagementService.fetchTransactions();
      const csvData = transactionManagementService.prepareCSVData(data);
      const filename = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
      
      transactionManagementService.downloadCSV(csvData, filename);

      toast({
        title: "Success",
        description: "Transactions downloaded successfully.",
      });

    } catch (error: any) {
      console.error('Error downloading transactions:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to download transactions.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTransaction(null);
    setAdminNotes('');
  };

  return {
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
  };
};


import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { GiftCardTransaction } from '@/components/admin/giftcards/types';

export const useGiftCardManagement = (onStatsUpdate?: () => void) => {
  const [giftCardTransactions, setGiftCardTransactions] = useState<GiftCardTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState<GiftCardTransaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [processingAction, setProcessingAction] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchGiftCardTransactions = async () => {
    try {
      if (!user) {
        console.log('No user found, skipping gift card transactions fetch');
        return;
      }

      console.log('Fetching gift card transactions for user:', user.id);
      
      // First verify admin status using the safe function
      const { data: isAdminData, error: adminError } = await supabase
        .rpc('is_admin_safe', { user_uuid: user.id });
      
      if (adminError) {
        console.error('Error checking admin status:', adminError);
        toast({
          title: "Permission Error",
          description: "Failed to verify admin permissions. Please contact support.",
          variant: "destructive",
        });
        return;
      }

      if (!isAdminData) {
        console.log('User is not an admin');
        toast({
          title: "Access Denied",
          description: "You don't have permission to view gift card transactions.",
          variant: "destructive",
        });
        return;
      }

      console.log('User verified as admin, fetching gift card transactions...');

      const { data, error } = await supabase
        .from('gift_card_transactions')
        .select(`
          *,
          profiles!user_id (
            name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching gift card transactions:', error);
        toast({
          title: "Error",
          description: `Failed to fetch gift card transactions: ${error.message}`,
          variant: "destructive",
        });
      } else {
        console.log('Gift card transactions fetched successfully:', data?.length || 0);
        setGiftCardTransactions(data || []);
      }
    } catch (error) {
      console.error('Unexpected error fetching gift card transactions:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while fetching gift card transactions.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Call fetchGiftCardTransactions on mount
  useEffect(() => {
    fetchGiftCardTransactions();
  }, []);

  const handleTransactionSelect = (transaction: GiftCardTransaction) => {
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
      console.log('Processing gift card transaction action:', { transactionId, action, adminNotes, userId: user.id });

      const newStatus = action === 'approve' ? 'completed' : 'rejected';
      
      const { error } = await supabase
        .from('gift_card_transactions')
        .update({
          status: newStatus,
          admin_notes: adminNotes,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', transactionId);

      if (error) {
        console.error('Error updating gift card transaction:', error);
        toast({
          title: "Error",
          description: `Failed to ${action} gift card transaction: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `Gift card transaction ${action}d successfully.`,
      });
      
      // Refresh transactions
      await fetchGiftCardTransactions();
      
      // Update stats in parent component
      if (onStatsUpdate) {
        onStatsUpdate();
      }
      
      setIsModalOpen(false);
      setSelectedTransaction(null);
    } catch (error) {
      console.error('Error processing gift card transaction action:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while processing the gift card transaction.",
        variant: "destructive",
      });
    } finally {
      setProcessingAction(false);
    }
  };

  const handleTransactionDelete = async (transactionId: string) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to perform this action.",
        variant: "destructive",
      });
      return;
    }

    // First verify admin status again for this sensitive operation
    const { data: isAdminData, error: adminError } = await supabase
      .rpc('is_admin_safe', { user_uuid: user.id });
    
    if (adminError || !isAdminData) {
      toast({
        title: "Error",
        description: "You don't have permission to delete transactions.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm("Are you sure you want to delete this gift card transaction? This action cannot be undone.")) {
      return;
    }

    setDeletingTransaction(transactionId);
    try {
      console.log('Deleting gift card transaction:', transactionId);

      // Use the service role or ensure proper RLS policies for admin deletion
      const { error } = await supabase
        .from('gift_card_transactions')
        .delete()
        .eq('id', transactionId);

      if (error) {
        console.error('Error deleting gift card transaction:', error);
        toast({
          title: "Error",
          description: `Failed to delete gift card transaction: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Gift card transaction deleted successfully.",
      });
      
      // Immediately update local state AND refresh from database
      setGiftCardTransactions(prevTransactions => 
        prevTransactions.filter(transaction => transaction.id !== transactionId)
      );
      
      // Also refresh from database to ensure consistency
      await fetchGiftCardTransactions();
      
      // Update stats in parent component
      if (onStatsUpdate) {
        onStatsUpdate();
      }
    } catch (error) {
      console.error('Error deleting gift card transaction:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while deleting the gift card transaction.",
        variant: "destructive",
      });
    } finally {
      setDeletingTransaction(null);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTransaction(null);
    setAdminNotes('');
  };

  const downloadTransactionHistory = async () => {
    try {
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to download transaction history.",
          variant: "destructive",
        });
        return;
      }

      setProcessingAction(true);

      // Create CSV content
      const csvHeaders = [
        'Transaction ID',
        'User Name',
        'User Email',
        'Card Type',
        'Card Value (USD)',
        'Status',
        'Admin Notes',
        'Created At',
        'Reviewed At',
        'Reviewed By'
      ];

      const csvRows = giftCardTransactions.map(transaction => [
        transaction.id,
        transaction.profiles?.name || 'N/A',
        transaction.profiles?.email || 'N/A',
        transaction.card_type,
        transaction.card_value,
        transaction.status,
        transaction.admin_notes || 'N/A',
        new Date(transaction.created_at).toLocaleString(),
        transaction.reviewed_at ? new Date(transaction.reviewed_at).toLocaleString() : 'N/A',
        transaction.reviewed_by || 'N/A'
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => 
          row.map(field => 
            typeof field === 'string' && field.includes(',') 
              ? `"${field.replace(/"/g, '""')}"` 
              : field
          ).join(',')
        )
      ].join('\n');

      // Create and download the file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `gift_card_transactions_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Success",
        description: "Transaction history downloaded successfully.",
      });
    } catch (error) {
      console.error('Error downloading transaction history:', error);
      toast({
        title: "Error",
        description: "Failed to download transaction history.",
        variant: "destructive",
      });
    } finally {
      setProcessingAction(false);
    }
  };

  return {
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
  };
};

import { supabase } from '@/integrations/supabase/client';

export const transactionManagementService = {
  async verifyAdminStatus(userId: string): Promise<boolean> {
    const { data: isAdminData, error: adminError } = await supabase
      .rpc('is_admin_safe', { user_uuid: userId });
    
    if (adminError || !isAdminData) {
      throw new Error('Admin verification failed - you do not have permission to access transactions');
    }

    return isAdminData;
  },

  async fetchTransactions(): Promise<any[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        profiles!user_id (
          name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  },

  async updateTransaction(transactionId: string, updates: any): Promise<void> {
    // If we're updating the status (approve/reject action), we MUST use the secure edge function 
    // because Admins do not have direct RLS permissions to update user wallets from the client.
    if (updates.status && (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled')) {
      const action = updates.status === 'completed' ? 'approve' : 'reject';
      
      const { data, error } = await supabase.functions.invoke('admin-transaction-action', {
        body: {
          transactionId,
          action,
          adminNotes: updates.admin_notes || ''
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to process transaction securely');
      }

      if (data?.error) {
        throw new Error(data.error);
      }
      
      return;
    }

    // Fallback for any other basic updates (that don't affect wallets)
    const { error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', transactionId);

    if (error) {
      throw error;
    }
  },

  async deletePendingTransactions(userId: string): Promise<number> {
    // Get all pending transactions
    const { data: pendingTransactions, error: fetchError } = await supabase
      .from('transactions')
      .select('id')
      .eq('status', 'pending');

    if (fetchError) {
      throw fetchError;
    }

    if (!pendingTransactions || pendingTransactions.length === 0) {
      return 0;
    }

    // Delete transactions one by one. If any fails (e.g., due to permissions),
    // the error will propagate up and stop the process.
    for (const transaction of pendingTransactions) {
      const { error: deleteError } = await supabase
        .rpc('delete_transaction_permanently', {
          transaction_id: transaction.id,
          admin_user_id: userId
        });

      if (deleteError) {
        // Log the detailed error and throw it to be handled by the UI hook.
        console.error('Error during transaction cleanup, stopping process:', deleteError);
        throw deleteError;
      }
    }

    return pendingTransactions.length;
  },

  prepareCSVData(transactions: any[]): any[] {
    return transactions?.map(transaction => ({
      'Transaction ID': transaction.id,
      'User Name': transaction.profiles?.name || 'N/A',
      'User Email': transaction.profiles?.email || 'N/A',
      'Type': transaction.type,
      'Amount': transaction.amount,
      'Asset': transaction.asset || 'N/A',
      'Fiat Amount': transaction.fiat_amount,
      'Fiat Currency': transaction.fiat_currency,
      'Status': transaction.status,
      'Description': transaction.description || 'N/A',
      'Reference': transaction.reference || 'N/A',
      'Admin Notes': transaction.admin_notes || 'N/A',
      'Created At': new Date(transaction.created_at).toLocaleString(),
      'Updated At': transaction.updated_at ? new Date(transaction.updated_at).toLocaleString() : 'N/A'
    })) || [];
  },

  downloadCSV(csvData: any[], filename: string): void {
    const headers = Object.keys(csvData[0] || {});
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row] || ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};


import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { transactionManagementService } from '@/services/transactionManagementService';

export const useTransactionData = () => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchTransactions = useCallback(async () => {
    if (!user) {
      console.log('No user found, skipping transaction fetch');
      setLoading(false);
      return;
    }

    try {
      console.log('Fetching transactions for user:', user.id);
      
      await transactionManagementService.verifyAdminStatus(user.id);
      const data = await transactionManagementService.fetchTransactions();
      
      console.log('Transactions fetched successfully:', data?.length || 0);
      setTransactions(data || []);
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch transactions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  const filterTransactions = useCallback(() => {
    let filtered = transactions;

    if (searchTerm) {
      filtered = filtered.filter(transaction =>
        transaction.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.profiles?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.profiles?.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(transaction => transaction.status === statusFilter);
    }

    setFilteredTransactions(filtered);
  }, [transactions, searchTerm, statusFilter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    filterTransactions();
  }, [filterTransactions]);

  return {
    transactions: filteredTransactions,
    loading,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    setTransactions,
    fetchTransactions
  };
};

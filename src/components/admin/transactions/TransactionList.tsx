
import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye } from 'lucide-react';
import { TransactionListProps } from './types';

const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  loading,
  onTransactionSelect
}) => {
  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    };
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fintech-orange"></div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-200 dark:border-gray-700">
            <TableHead className="text-gray-900 dark:text-white">User</TableHead>
            <TableHead className="text-gray-900 dark:text-white">Type</TableHead>
            <TableHead className="text-gray-900 dark:text-white">Amount</TableHead>
            <TableHead className="text-gray-900 dark:text-white">Status</TableHead>
            <TableHead className="text-gray-900 dark:text-white">Date</TableHead>
            <TableHead className="text-gray-900 dark:text-white">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow key={transaction.id} className="border-gray-200 dark:border-gray-700">
              <TableCell className="text-gray-900 dark:text-white">
                <div>
                  <p className="font-medium">{transaction.profiles?.name}</p>
                  <p className="text-sm text-gray-500">{transaction.profiles?.email}</p>
                </div>
              </TableCell>
              <TableCell className="text-gray-900 dark:text-white capitalize">{transaction.type}</TableCell>
              <TableCell className="text-gray-900 dark:text-white">₦{(transaction.fiat_amount ?? transaction.amount ?? 0).toLocaleString()}</TableCell>
              <TableCell>
                <Badge className={getStatusBadge(transaction.status)}>
                  {transaction.status}
                </Badge>
              </TableCell>
              <TableCell className="text-gray-900 dark:text-white">
                {new Date(transaction.created_at).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTransactionSelect(transaction)}
                  className="text-fintech-orange hover:bg-fintech-orange/10"
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default TransactionList;

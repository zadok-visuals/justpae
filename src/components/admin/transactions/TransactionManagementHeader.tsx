
import React from 'react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CleanupConfirmationDialog from './CleanupConfirmationDialog';

interface TransactionManagementHeaderProps {
  cleaningPending: boolean;
  downloading: boolean;
  onCleanupConfirm: () => void;
  onDownload: () => void;
}

const TransactionManagementHeader: React.FC<TransactionManagementHeaderProps> = ({
  cleaningPending,
  downloading,
  onCleanupConfirm,
  onDownload
}) => {
  return (
    <CardHeader>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <DollarSign className="w-6 h-6 text-fintech-orange" />
          <CardTitle className="text-xl text-gray-900 dark:text-white">Transaction Management</CardTitle>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            onClick={onDownload}
            disabled={downloading}
            variant="outline"
            className="border-green-200 text-green-600 bg-green-50"
          >
            <Download className="w-4 h-4 mr-2" />
            {downloading ? 'Downloading...' : 'Download CSV'}
          </Button>
          <CleanupConfirmationDialog
            cleaningPending={cleaningPending}
            onConfirm={onCleanupConfirm}
          />
        </div>
      </div>
    </CardHeader>
  );
};

export default TransactionManagementHeader;

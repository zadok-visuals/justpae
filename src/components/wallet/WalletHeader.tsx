
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const WalletHeader: React.FC = () => {
  return (
    <div className="flex items-center space-x-4">
      <Link to="/dashboard">
        <Button variant="ghost" size="sm" className="p-2 text-gray-600 dark:text-gray-300">
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </Link>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Transaction History</h1>
    </div>
  );
};

export default WalletHeader;

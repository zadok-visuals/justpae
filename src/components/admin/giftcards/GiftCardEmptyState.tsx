
import React from 'react';
import { Gift } from 'lucide-react';

interface GiftCardEmptyStateProps {
  loading: boolean;
}

const GiftCardEmptyState: React.FC<GiftCardEmptyStateProps> = ({ loading }) => {
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-12 h-12 border-4 border-fintech-orange border-t-transparent rounded-full mx-auto mb-4"></div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Loading gift card transactions...</h3>
        <p className="text-gray-500 dark:text-gray-400">Please wait while we fetch the data</p>
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <Gift className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No gift card submissions</h3>
      <p className="text-gray-500 dark:text-gray-400">Gift card submissions will appear here for review</p>
    </div>
  );
};

export default GiftCardEmptyState;

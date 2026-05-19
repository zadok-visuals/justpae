
import React from 'react';

interface SalePreviewProps {
  usdValue: number;
  exchangeRate: number;
  currentPrice: number;
  selectedCrypto: string;
  formatCurrency: (amount: number, currency?: string, showDecimals?: boolean) => string;
}

const SalePreview: React.FC<SalePreviewProps> = ({
  usdValue,
  exchangeRate,
  currentPrice,
  selectedCrypto,
  formatCurrency
}) => {
  return (
    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg space-y-2">
      <div className="flex justify-between">
        <span className="text-gray-700 dark:text-gray-300">You will receive (USD):</span>
        <span className="font-semibold text-green-600 dark:text-green-400">
          {formatCurrency(usdValue, 'USD')}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-700 dark:text-gray-300">You will receive (NGN):</span>
        <span className="font-semibold text-green-600 dark:text-green-400">
          {formatCurrency(usdValue * exchangeRate, 'NGN')}
        </span>
      </div>
      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>Current rate:</span>
        <span>{formatCurrency(exchangeRate, 'NGN')} / USD</span>
      </div>
    </div>
  );
};

export default SalePreview;


import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TransactionLimitsSectionProps {
  maxTransactionAmount: string;
  kycRequiredThreshold: string;
  usdToNgnRate: string;
  cryptoBuyRate?: string;
  cryptoSellRate?: string;
  onMaxAmountChange: (value: string) => void;
  onKycThresholdChange: (value: string) => void;
  onUsdToNgnRateChange: (value: string) => void;
  onCryptoBuyRateChange?: (value: string) => void;
  onCryptoSellRateChange?: (value: string) => void;
}

const TransactionLimitsSection: React.FC<TransactionLimitsSectionProps> = ({
  maxTransactionAmount,
  kycRequiredThreshold,
  usdToNgnRate,
  cryptoBuyRate = '1680',
  cryptoSellRate = '1620',
  onMaxAmountChange,
  onKycThresholdChange,
  onUsdToNgnRateChange,
  onCryptoBuyRateChange,
  onCryptoSellRateChange
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div className="space-y-2">
        <Label className="text-gray-900 dark:text-white">Maximum Transaction Amount (NGN)</Label>
        <Input
          type="number"
          value={maxTransactionAmount}
          onChange={(e) => onMaxAmountChange(e.target.value)}
          placeholder="1000000"
          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
        />
        <p className="text-xs text-gray-500">Maximum amount for a single transaction</p>
      </div>

      <div className="space-y-2">
        <Label className="text-gray-900 dark:text-white">KYC Required Threshold (NGN)</Label>
        <Input
          type="number"
          value={kycRequiredThreshold}
          onChange={(e) => onKycThresholdChange(e.target.value)}
          placeholder="50000"
          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
        />
        <p className="text-xs text-gray-500">Amount threshold requiring KYC verification</p>
      </div>

      <div className="space-y-2">
        <Label className="text-gray-900 dark:text-white">General USD to NGN Rate (₦)</Label>
        <Input
          type="number"
          step="0.01"
          value={usdToNgnRate}
          onChange={(e) => onUsdToNgnRateChange(e.target.value)}
          placeholder="1650"
          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
        />
        <p className="text-xs text-gray-500">Used for portfolio valuation fallback</p>
      </div>

      <div className="space-y-2">
        <Label className="text-gray-900 dark:text-white">Crypto Buy Rate (₦/USD)</Label>
        <Input
          type="number"
          step="0.01"
          value={cryptoBuyRate}
          onChange={(e) => onCryptoBuyRateChange?.(e.target.value)}
          placeholder="1680"
          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
        />
        <p className="text-xs text-gray-500">Rate applied when users buy crypto</p>
      </div>

      <div className="space-y-2">
        <Label className="text-gray-900 dark:text-white">Crypto Sell Rate (₦/USD)</Label>
        <Input
          type="number"
          step="0.01"
          value={cryptoSellRate}
          onChange={(e) => onCryptoSellRateChange?.(e.target.value)}
          placeholder="1620"
          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
        />
        <p className="text-xs text-gray-500">Rate applied when users sell crypto</p>
      </div>
    </div>
  );
};

export default TransactionLimitsSection;

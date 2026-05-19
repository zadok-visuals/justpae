
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TransactionLimitsSectionProps {
  maxTransactionAmount: string;
  kycRequiredThreshold: string;
  usdToNgnRate: string;
  onMaxAmountChange: (value: string) => void;
  onKycThresholdChange: (value: string) => void;
  onUsdToNgnRateChange: (value: string) => void;
}

const TransactionLimitsSection: React.FC<TransactionLimitsSectionProps> = ({
  maxTransactionAmount,
  kycRequiredThreshold,
  usdToNgnRate,
  onMaxAmountChange,
  onKycThresholdChange,
  onUsdToNgnRateChange
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
        <Label className="text-gray-900 dark:text-white">USD to NGN Exchange Rate (₦)</Label>
        <Input
          type="number"
          step="0.01"
          value={usdToNgnRate}
          onChange={(e) => onUsdToNgnRateChange(e.target.value)}
          placeholder="1650"
          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
        />
        <p className="text-xs text-gray-500">Manual conversion rate used across the app</p>
      </div>
    </div>
  );
};

export default TransactionLimitsSection;

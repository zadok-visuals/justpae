
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TransactionLimitsSectionProps {
  maxTransactionAmount: string;
  kycRequiredThreshold: string;
  onMaxAmountChange: (value: string) => void;
  onKycThresholdChange: (value: string) => void;
}

const TransactionLimitsSection: React.FC<TransactionLimitsSectionProps> = ({
  maxTransactionAmount,
  kycRequiredThreshold,
  onMaxAmountChange,
  onKycThresholdChange
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
    </div>
  );
};

export default TransactionLimitsSection;

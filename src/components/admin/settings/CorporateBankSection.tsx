import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CorporateBankSectionProps {
  bankName: string;
  accountNumber: string;
  accountName: string;
  onBankNameChange: (value: string) => void;
  onAccountNumberChange: (value: string) => void;
  onAccountNameChange: (value: string) => void;
}

const CorporateBankSection: React.FC<CorporateBankSectionProps> = ({
  bankName,
  accountNumber,
  accountName,
  onBankNameChange,
  onAccountNumberChange,
  onAccountNameChange
}) => {
  return (
    <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white">Corporate Deposit Bank Details</h3>
      <p className="text-sm text-gray-500">Configure the corporate bank details displayed to users when they perform a manual Bank Transfer deposit.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <Label className="text-gray-900 dark:text-white">Bank Name</Label>
          <Input
            type="text"
            value={bankName}
            onChange={(e) => onBankNameChange(e.target.value)}
            placeholder="AmazingPay Bank"
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-gray-900 dark:text-white">Account Number</Label>
          <Input
            type="text"
            value={accountNumber}
            onChange={(e) => onAccountNumberChange(e.target.value)}
            placeholder="2109876543"
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-gray-900 dark:text-white">Account Name</Label>
          <Input
            type="text"
            value={accountName}
            onChange={(e) => onAccountNameChange(e.target.value)}
            placeholder="AmazingPay Limited"
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>
    </div>
  );
};

export default CorporateBankSection;

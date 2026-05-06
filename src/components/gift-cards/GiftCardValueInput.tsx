
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DollarSign } from 'lucide-react';

interface GiftCardValueInputProps {
  value: string;
  onChange: (value: string) => void;
}

const GiftCardValueInput: React.FC<GiftCardValueInputProps> = ({ value, onChange }) => {
  return (
    <div className="space-y-2">
      <Label htmlFor="card-value" className="text-gray-700 dark:text-gray-300">Gift Card Value ($)</Label>
      <div className="relative">
        <DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <Input
          id="card-value"
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter gift card value"
          className="pl-10 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
        />
      </div>
    </div>
  );
};

export default GiftCardValueInput;

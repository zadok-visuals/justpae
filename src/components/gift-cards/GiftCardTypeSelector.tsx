
import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface GiftCardTypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const GiftCardTypeSelector: React.FC<GiftCardTypeSelectorProps> = ({ value, onChange }) => {
  return (
    <div className="space-y-2">
      <Label htmlFor="card-type" className="text-gray-700 dark:text-gray-300">Gift Card Type</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <SelectValue placeholder="Select gift card type" />
        </SelectTrigger>
        <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <SelectItem value="Amazon">Amazon</SelectItem>
          <SelectItem value="Apple iTunes">Apple iTunes</SelectItem>
          <SelectItem value="Google Play">Google Play</SelectItem>
          <SelectItem value="Steam">Steam</SelectItem>
          <SelectItem value="Nike">Nike</SelectItem>
          <SelectItem value="Sephora">Sephora</SelectItem>
          <SelectItem value="American Express">American Express</SelectItem>
          <SelectItem value="Vanilla Visa">Vanilla Visa</SelectItem>
          <SelectItem value="eBay">eBay</SelectItem>
          <SelectItem value="Walmart">Walmart</SelectItem>
          <SelectItem value="Target">Target</SelectItem>
          <SelectItem value="Best Buy">Best Buy</SelectItem>
          <SelectItem value="Other">Other</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default GiftCardTypeSelector;

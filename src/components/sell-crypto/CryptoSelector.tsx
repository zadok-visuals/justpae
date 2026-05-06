
import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CryptoOption {
  symbol: string;
  name: string;
  icon: string;
  address: string;
  network: string;
}

interface CryptoSelectorProps {
  selectedCrypto: string;
  onSelectCrypto: (value: string) => void;
  cryptoOptions: CryptoOption[];
  getCurrentPrice: (symbol: string) => number;
  formatCurrency: (amount: number, currency?: string, showDecimals?: boolean) => string;
}

const CryptoSelector: React.FC<CryptoSelectorProps> = ({
  selectedCrypto,
  onSelectCrypto,
  cryptoOptions,
  getCurrentPrice,
  formatCurrency
}) => {
  return (
    <div className="space-y-2">
      <Label className="text-gray-900 dark:text-white">Select Cryptocurrency to Sell</Label>
      <Select value={selectedCrypto} onValueChange={onSelectCrypto}>
        <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
          <SelectValue placeholder="Choose a cryptocurrency to sell" />
        </SelectTrigger>
        <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          {cryptoOptions.map((crypto) => {
            const price = getCurrentPrice(crypto.symbol);
            return (
              <SelectItem key={crypto.symbol} value={crypto.symbol} className="text-gray-900 dark:text-white">
                <div className="flex items-center space-x-2">
                  <span>{crypto.icon}</span>
                  <span>{crypto.name} ({crypto.symbol})</span>
                  <span className="text-gray-500 dark:text-gray-400 text-sm">- {formatCurrency(price, 'USD', false)}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};

export default CryptoSelector;

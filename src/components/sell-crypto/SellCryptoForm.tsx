
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CryptoSelector from './CryptoSelector';
import SalePreview from './SalePreview';

interface CryptoOption {
  symbol: string;
  name: string;
  icon: string;
  network: string;
}

interface SellCryptoFormProps {
  selectedCrypto: string;
  setSelectedCrypto: (value: string) => void;
  usdAmount: string;
  setUsdAmount: (value: string) => void;
  isLoading: boolean;
  cryptoOptions: CryptoOption[];
  getCurrentPrice: (symbol: string) => number;
  formatCurrency: (amount: number, currency?: string, showDecimals?: boolean) => string;
  selectedCryptoData: CryptoOption | undefined;
  currentPrice: number;
  usdValue: number;
  calculatedCryptoAmount: number;
  exchangeRate: number;
  onSell: () => void;
}

const SellCryptoForm: React.FC<SellCryptoFormProps> = ({
  selectedCrypto,
  setSelectedCrypto,
  usdAmount,
  setUsdAmount,
  isLoading,
  cryptoOptions,
  getCurrentPrice,
  formatCurrency,
  selectedCryptoData,
  currentPrice,
  usdValue,
  calculatedCryptoAmount,
  exchangeRate,
  onSell
}) => {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-gray-900 dark:text-white">Sale Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CryptoSelector
          selectedCrypto={selectedCrypto}
          onSelectCrypto={setSelectedCrypto}
          cryptoOptions={cryptoOptions}
          getCurrentPrice={getCurrentPrice}
          exchangeRate={exchangeRate}
          formatCurrency={formatCurrency}
        />

        <div className="space-y-2">
          <Label className="text-gray-900 dark:text-white">Amount to Sell (USD)</Label>
          <Input
            type="number"
            placeholder="Enter $ amount"
            value={usdAmount}
            onChange={(e) => setUsdAmount(e.target.value)}
            min="0"
            step="0.01"
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        {selectedCryptoData && usdAmount && (
          <SalePreview
            usdValue={usdValue}
            exchangeRate={exchangeRate}
            currentPrice={currentPrice}
            selectedCrypto={selectedCrypto}
            calculatedCryptoAmount={calculatedCryptoAmount}
            formatCurrency={formatCurrency}
          />
        )}



        <Button 
          onClick={onSell}
          disabled={!selectedCrypto || !usdAmount || isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 py-3 text-white font-semibold"
        >
          {isLoading ? 'Processing Trade...' : `Execute Trade`}
        </Button>

        <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
          <p>Instant liquidation via licensed liquidity provider.</p>
          <p>Fiat funds will be credited to your virtual wallet automatically.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default SellCryptoForm;

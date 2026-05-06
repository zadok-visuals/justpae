
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CryptoSelector from './CryptoSelector';
import SalePreview from './SalePreview';
import WalletAddress from './WalletAddress';

interface CryptoOption {
  symbol: string;
  name: string;
  icon: string;
  address: string;
  network: string;
}

interface SellCryptoFormProps {
  selectedCrypto: string;
  setSelectedCrypto: (value: string) => void;
  cryptoAmount: string;
  setCryptoAmount: (value: string) => void;
  isLoading: boolean;
  cryptoOptions: CryptoOption[];
  getCurrentPrice: (symbol: string) => number;
  formatCurrency: (amount: number, currency?: string, showDecimals?: boolean) => string;
  selectedCryptoData: CryptoOption | undefined;
  currentPrice: number;
  usdValue: number;
  exchangeRate: number;
  onCopyAddress: (address: string) => void;
  onSell: () => void;
}

const SellCryptoForm: React.FC<SellCryptoFormProps> = ({
  selectedCrypto,
  setSelectedCrypto,
  cryptoAmount,
  setCryptoAmount,
  isLoading,
  cryptoOptions,
  getCurrentPrice,
  formatCurrency,
  selectedCryptoData,
  currentPrice,
  usdValue,
  exchangeRate,
  onCopyAddress,
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
          formatCurrency={formatCurrency}
        />

        <div className="space-y-2">
          <Label className="text-gray-900 dark:text-white">Amount to Sell</Label>
          <Input
            type="number"
            placeholder={`Enter ${selectedCrypto || 'crypto'} amount`}
            value={cryptoAmount}
            onChange={(e) => setCryptoAmount(e.target.value)}
            min="0"
            step="0.000001"
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        {selectedCryptoData && cryptoAmount && (
          <SalePreview
            usdValue={usdValue}
            exchangeRate={exchangeRate}
            currentPrice={currentPrice}
            selectedCrypto={selectedCrypto}
            formatCurrency={formatCurrency}
          />
        )}

        {selectedCryptoData && (
          <WalletAddress
            selectedCryptoData={selectedCryptoData}
            onCopyAddress={onCopyAddress}
          />
        )}

        <Button 
          onClick={onSell}
          disabled={!selectedCrypto || !cryptoAmount || isLoading}
          className="w-full bg-fintech-orange hover:bg-fintech-orange/90 py-3"
        >
          {isLoading ? 'Creating Sell Order...' : `Create Sell Order`}
        </Button>

        <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
          <p>⚠️ Only send {selectedCrypto} to this address on {selectedCryptoData?.network} network.</p>
          <p>Sending other tokens or using wrong network will result in permanent loss.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default SellCryptoForm;

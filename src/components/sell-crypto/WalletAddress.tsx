
import React from 'react';
import { Button } from '@/components/ui/button';
import { Copy, QrCode } from 'lucide-react';

interface CryptoOption {
  symbol: string;
  name: string;
  icon: string;
  address: string;
  network: string;
}

interface WalletAddressProps {
  selectedCryptoData: CryptoOption;
  onCopyAddress: (address: string) => void;
}

const WalletAddress: React.FC<WalletAddressProps> = ({
  selectedCryptoData,
  onCopyAddress
}) => {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg space-y-3">
      <h3 className="font-semibold text-blue-900 dark:text-blue-200">
        Send your {selectedCryptoData.symbol} to:
      </h3>
      <div className="space-y-2">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Network: {selectedCryptoData.network}
        </div>
        <div className="flex items-center space-x-2 bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
          <code className="flex-1 text-sm font-mono break-all text-gray-900 dark:text-white">
            {selectedCryptoData.address}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCopyAddress(selectedCryptoData.address)}
            className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
          <QrCode className="w-4 h-4" />
          <span>QR code available in mobile app</span>
        </div>
      </div>
    </div>
  );
};

export default WalletAddress;

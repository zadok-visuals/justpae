
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { CryptoPrice } from '@/services/cryptoService';

interface MarketTrendsProps {
  marketData: CryptoPrice[];
  isLoadingPrices: boolean;
  onRefresh: () => void;
}

const MarketTrends: React.FC<MarketTrendsProps> = ({
  marketData,
  isLoadingPrices,
  onRefresh
}) => {
  const getCryptoLogo = (symbol: string) => {
    const logos: Record<string, string> = {
      'BTC': '₿',
      'ETH': 'Ξ',
      'ADA': '₳'
    };
    return logos[symbol] || symbol[0];
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Market Trend</h2>
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onRefresh}
            disabled={isLoadingPrices}
            className="text-fintech-orange p-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingPrices ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" className="text-fintech-orange">
            See All
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {marketData.length > 0 ? (
          marketData.map((crypto, index) => (
            <Card key={index} className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-fintech-orange rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {getCryptoLogo(crypto.symbol)}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">{crypto.symbol}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Volume: ${crypto.volume24h.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900 dark:text-white">${crypto.price.toLocaleString()}</div>
                    <div className={`text-sm ${crypto.change24h >= 0 ? 'text-fintech-green' : 'text-red-500'}`}>
                      {crypto.change24h >= 0 ? '+' : ''}{crypto.change24h.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {isLoadingPrices ? 'Loading market data...' : 'No market data available'}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketTrends;

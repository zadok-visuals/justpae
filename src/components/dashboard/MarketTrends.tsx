
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Market Trend</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoadingPrices}
            className="text-primary p-2 rounded-full"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingPrices ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" className="text-primary rounded-full">
            See All
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {marketData.length > 0 ? (
          marketData.map((crypto, index) => (
            <Card key={index} className="rounded-2xl border border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-base">
                      {getCryptoLogo(crypto.symbol)}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{crypto.symbol}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">Volume: ${crypto.volume24h.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-foreground tabular-nums">${crypto.price.toLocaleString()}</div>
                    <div className={`text-sm tabular-nums ${crypto.change24h >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {crypto.change24h >= 0 ? '+' : ''}{crypto.change24h.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {isLoadingPrices ? 'Loading market data...' : 'No market data available'}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketTrends;

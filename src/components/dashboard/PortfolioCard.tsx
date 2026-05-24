
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

interface PortfolioCardProps {
  totalValue: number;
  pendingFiatBalance: number;
  hideBalance: boolean;
  onToggleBalanceVisibility: () => void;
  formatBalance: (amount: number) => string;
  formatEquivalentUSD: (amount: number) => string;
}

const PortfolioCard: React.FC<PortfolioCardProps> = ({
  totalValue,
  pendingFiatBalance,
  hideBalance,
  onToggleBalanceVisibility,
  formatBalance,
  formatEquivalentUSD
}) => {
  return (
    <Card className="fintech-gradient-blue text-white rounded-2xl shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm opacity-80">Total Portfolio</h2>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-white p-1 h-auto"
            onClick={onToggleBalanceVisibility}
            >
            {hideBalance ? (
              <>
                <EyeOff className="w-4 h-4" />
                <span className="ml-1 text-xs">Show Balance</span>
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                <span className="ml-1 text-xs">Hide Balance</span>
              </>
            )}
          </Button>
        </div>
        <div className="space-y-1">
          <div className="text-3xl font-bold">
            {formatBalance(totalValue)}
          </div>
          <div className="text-lg opacity-80">
            {formatEquivalentUSD(totalValue)}
          </div>
          {pendingFiatBalance > 0 && (
            <div className="mt-4 pt-4 border-t border-white/20">
              <p className="text-xs opacity-80 mb-1 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                Pending Clearance
              </p>
              <p className="text-sm font-semibold">{formatBalance(pendingFiatBalance)}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PortfolioCard;

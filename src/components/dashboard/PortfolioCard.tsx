
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
    <Card className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div
        className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary opacity-[0.08] blur-3xl"
        aria-hidden="true"
      />
      <CardContent className="relative p-6 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Total Portfolio
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-auto py-1 px-2 rounded-full"
            onClick={onToggleBalanceVisibility}
          >
            {hideBalance ? (
              <>
                <EyeOff className="w-4 h-4" />
                <span className="ml-1.5 text-xs font-medium">Show</span>
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                <span className="ml-1.5 text-xs font-medium">Hide</span>
              </>
            )}
          </Button>
        </div>
        <div className="space-y-1">
          <div className="font-display text-4xl sm:text-5xl font-medium tracking-tight tabular-nums text-foreground">
            {formatBalance(totalValue)}
          </div>
          <div className="text-base text-muted-foreground tabular-nums">
            {formatEquivalentUSD(totalValue)}
          </div>
        </div>
        {pendingFiatBalance > 0 && (
          <div className="mt-5 pt-5 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Pending clearance
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground">{formatBalance(pendingFiatBalance)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PortfolioCard;

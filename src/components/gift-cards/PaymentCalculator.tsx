
import React from 'react';
import { Calculator } from 'lucide-react';
import { giftCardTypes, formatCurrency, calculateNairaEquivalent } from './types';

interface PaymentCalculatorProps {
  selectedCardType: string;
  cardValue: string;
}

const PaymentCalculator: React.FC<PaymentCalculatorProps> = ({
  selectedCardType,
  cardValue
}) => {
  const nairaEquivalent = calculateNairaEquivalent(selectedCardType, cardValue);
  const selectedCardInfo = giftCardTypes.find(card => 
    card.id === selectedCardType || card.name === selectedCardType
  );

  if (!selectedCardType || !cardValue) {
    return null;
  }

  return (
    <div className="bg-fintech-orange/10 border border-fintech-orange/20 rounded-lg p-4">
      <div className="flex items-center space-x-2 mb-2">
        <Calculator className="w-5 h-5 text-fintech-orange" />
        <h3 className="font-semibold text-gray-900 dark:text-white">Expected Payment</h3>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {selectedCardInfo?.name} @ {selectedCardInfo?.rate}% rate
        </p>
        <p className="text-2xl font-bold text-fintech-orange">
          {formatCurrency(nairaEquivalent, 'NGN')}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          *Rate subject to verification and market conditions
        </p>
      </div>
    </div>
  );
};

export default PaymentCalculator;


import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { giftCardTypes } from './types';

interface GiftCardTypesGridProps {
  onCardTypeSelect?: (cardType: string) => void;
}

const GiftCardTypesGrid: React.FC<GiftCardTypesGridProps> = ({ onCardTypeSelect }) => {
  const handleCardSelect = (cardType: string) => {
    if (onCardTypeSelect) {
      onCardTypeSelect(cardType);
    }
    // Scroll to the upload form
    const uploadForm = document.getElementById('gift-card-upload-form');
    if (uploadForm) {
      uploadForm.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg text-gray-900 dark:text-white">Popular Gift Cards</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {giftCardTypes.map((card) => (
            <Button
              key={card.id}
              variant="outline"
              className="h-auto p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-fintech-orange/30 transition-colors"
              onClick={() => handleCardSelect(card.name)}
            >
              <div className="text-center w-full">
                <div className="text-3xl mb-2">{card.icon}</div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{card.name}</h3>
                <p className="text-fintech-orange font-bold">{card.rate}% rate</p>
              </div>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default GiftCardTypesGrid;

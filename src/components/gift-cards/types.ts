
export interface GiftCardType {
  id: string;
  name: string;
  rate: number;
  icon: string;
}

export interface GiftCardTransaction {
  id: string;
  card_type: string;
  card_value: number;
  image_url: string;
  status: string;
  created_at: string;
  admin_notes?: string;
}

export const giftCardTypes: GiftCardType[] = [
  { id: 'amazon', name: 'Amazon', rate: 85, icon: '📦' },
  { id: 'apple', name: 'Apple iTunes', rate: 80, icon: '🍎' },
  { id: 'google', name: 'Google Play', rate: 82, icon: '📱' },
  { id: 'steam', name: 'Steam', rate: 78, icon: '🎮' },
  { id: 'walmart', name: 'Walmart', rate: 75, icon: '🛒' },
  { id: 'target', name: 'Target', rate: 73, icon: '🎯' }
];

export const formatCurrency = (amount: number, currency: string = 'NGN') => {
  if (currency === 'NGN') {
    return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  } else if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return amount.toLocaleString('en-US');
};

export const calculateNairaEquivalent = (cardType: string, value: string): number => {
  if (!cardType || !value) return 0;
  
  const selectedCard = giftCardTypes.find(card => 
    card.id === cardType || card.name === cardType
  );
  if (!selectedCard) return 0;
  
  const usdValue = parseFloat(value);
  const exchangeRate = 1650; // USD to NGN rate (you can make this dynamic later)
  const ratePercentage = selectedCard.rate / 100;
  
  return Math.round(usdValue * exchangeRate * ratePercentage);
};

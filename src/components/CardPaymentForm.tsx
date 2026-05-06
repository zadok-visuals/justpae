
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard } from 'lucide-react';

interface CardPaymentFormProps {
  amount: string;
  onSubmit: (cardData: any) => void;
  loading: boolean;
}

const CardPaymentForm: React.FC<CardPaymentFormProps> = ({ amount, onSubmit, loading }) => {
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [cardType, setCardType] = useState('');

  const handleSubmit = () => {
    const cardData = {
      cardNumber,
      expiryDate,
      cvv,
      cardholderName,
      cardType,
      amount: parseFloat(amount)
    };
    onSubmit(cardData);
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const formatExpiryDate = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  return (
    <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-white">
          <CreditCard className="w-5 h-5 text-fintech-orange" />
          <span>Card Payment Details</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cardType" className="text-gray-900 dark:text-white">Card Type</Label>
          <Select value={cardType} onValueChange={setCardType}>
            <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
              <SelectValue placeholder="Select card type" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectItem value="visa" className="text-gray-900 dark:text-white">Visa</SelectItem>
              <SelectItem value="mastercard" className="text-gray-900 dark:text-white">Mastercard</SelectItem>
              <SelectItem value="verve" className="text-gray-900 dark:text-white">Verve</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cardholderName" className="text-gray-900 dark:text-white">Cardholder Name</Label>
          <Input
            id="cardholderName"
            placeholder="Enter name on card"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cardNumber" className="text-gray-900 dark:text-white">Card Number</Label>
          <Input
            id="cardNumber"
            placeholder="0000 0000 0000 0000"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            maxLength={19}
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="expiryDate" className="text-gray-900 dark:text-white">Expiry Date</Label>
            <Input
              id="expiryDate"
              placeholder="MM/YY"
              value={expiryDate}
              onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
              maxLength={5}
              className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cvv" className="text-gray-900 dark:text-white">CVV</Label>
            <Input
              id="cvv"
              placeholder="123"
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
              maxLength={3}
              type="password"
              className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-900 dark:text-white">Amount to charge:</span>
            <span className="text-xl font-bold text-fintech-orange">₦{parseFloat(amount || '0').toLocaleString()}</span>
          </div>
        </div>

        <Button 
          onClick={handleSubmit}
          disabled={!cardNumber || !expiryDate || !cvv || !cardholderName || !cardType || loading}
          className="w-full bg-fintech-orange hover:bg-fintech-orange/90"
        >
          {loading ? 'Processing Payment...' : `Pay ₦${parseFloat(amount || '0').toLocaleString()}`}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CardPaymentForm;


import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import GiftCardTypeSelector from './GiftCardTypeSelector';
import GiftCardValueInput from './GiftCardValueInput';
import GiftCardImageUpload from './GiftCardImageUpload';
import PaymentCalculator from './PaymentCalculator';
import UploadGuidelines from './UploadGuidelines';
import { useGiftCardUpload } from '@/hooks/useGiftCardUpload';

interface GiftCardUploadFormProps {
  onSubmitSuccess?: () => void;
  preSelectedCardType?: string;
}

const GiftCardUploadForm: React.FC<GiftCardUploadFormProps> = ({ 
  onSubmitSuccess,
  preSelectedCardType 
}) => {
  const {
    selectedCardType,
    setSelectedCardType,
    cardValue,
    setCardValue,
    uploadedImage,
    setUploadedImage,
    isUploading,
    handleSubmit
  } = useGiftCardUpload(onSubmitSuccess);

  // Set pre-selected card type when provided
  useEffect(() => {
    if (preSelectedCardType && preSelectedCardType !== selectedCardType) {
      setSelectedCardType(preSelectedCardType);
    }
  }, [preSelectedCardType, selectedCardType, setSelectedCardType]);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-xl text-gray-900 dark:text-white">Sell Your Gift Card</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="border-fintech-orange/20 bg-fintech-orange/5">
          <AlertCircle className="h-4 w-4 text-fintech-orange" />
          <AlertDescription className="text-gray-700 dark:text-gray-300">
            Upload clear, high-quality images of both front and back of your gift card for faster processing.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-6">
          <GiftCardTypeSelector 
            value={selectedCardType} 
            onChange={setSelectedCardType} 
          />
          
          <GiftCardValueInput 
            value={cardValue} 
            onChange={setCardValue} 
          />

          <PaymentCalculator 
            selectedCardType={selectedCardType}
            cardValue={cardValue}
          />
          
          <GiftCardImageUpload 
            uploadedImage={uploadedImage}
            setUploadedImage={setUploadedImage}
          />

          <Button
            type="submit"
            disabled={!selectedCardType || !cardValue || !uploadedImage || isUploading}
            className="w-full bg-fintech-orange hover:bg-fintech-orange/90 text-white"
          >
            <Upload className="w-4 h-4 mr-2" />
            {isUploading ? 'Submitting...' : 'Submit Gift Card'}
          </Button>
        </form>

        <UploadGuidelines />
      </CardContent>
    </Card>
  );
};

export default GiftCardUploadForm;


import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock } from 'lucide-react';

interface PinVerificationProps {
  onVerify: (pin: string) => Promise<boolean>;
  onCancel: () => void;
  title?: string;
  description?: string;
}

const PinVerification: React.FC<PinVerificationProps> = ({ 
  onVerify, 
  onCancel, 
  title = "PIN Verification Required",
  description = "Please enter your 4-digit PIN to continue with this transaction"
}) => {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async () => {
    if (pin.length !== 4) {
      setError('PIN must be 4 digits');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const isValid = await onVerify(pin);
      if (!isValid) {
        setError('Invalid PIN. Please try again.');
        setPin('');
      }
    } catch (error) {
      setError('Verification failed. Please try again.');
      setPin('');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="text-center pb-4">
          <div className="w-10 h-10 bg-fintech-orange rounded-full flex items-center justify-center mx-auto mb-2">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <CardTitle className="text-lg text-gray-900 dark:text-white">{title}</CardTitle>
          <p className="text-xs text-gray-600 dark:text-gray-400">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pin" className="text-sm text-gray-900 dark:text-white">Enter PIN</Label>
            <Input
              id="pin"
              type="password"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              className="text-center text-xl font-mono bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white h-12"
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          <div className="flex space-x-2">
            <Button 
              onClick={handleVerify}
              disabled={pin.length !== 4 || isVerifying}
              className="flex-1 bg-fintech-orange hover:bg-fintech-orange/90 h-10"
              size="sm"
            >
              {isVerifying ? 'Verifying...' : 'Verify'}
            </Button>
            <Button 
              variant="outline" 
              onClick={onCancel}
              disabled={isVerifying}
              className="flex-1 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 h-10"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PinVerification;

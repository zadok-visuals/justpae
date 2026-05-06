
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Lock, Eye, EyeOff } from 'lucide-react';

interface PinSetupProps {
  onPinSet: (pin: string) => Promise<boolean>;
  onSkip?: () => void;
  title?: string;
  description?: string;
  allowSkip?: boolean;
}

const PinSetup: React.FC<PinSetupProps> = ({ 
  onPinSet, 
  onSkip, 
  title = "Set Up Your Security PIN",
  description = "Create a 4-digit PIN to secure your transactions",
  allowSkip = false
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const handleSetPin = async () => {
    if (pin.length !== 4) {
      setError('PIN must be 4 digits');
      return;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const success = await onPinSet(pin);
      if (success) {
        toast({
          title: "Success",
          description: "PIN has been set successfully"
        });
      } else {
        setError('Failed to set PIN. Please try again.');
      }
    } catch (error) {
      setError('An error occurred while setting your PIN.');
    } finally {
      setIsLoading(false);
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
            <Label htmlFor="pin" className="text-sm text-gray-900 dark:text-white">Create 4-digit PIN</Label>
            <div className="relative">
              <Input
                id="pin"
                type={showPin ? "text" : "password"}
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center h-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => setShowPin(!showPin)}
              >
                {showPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="confirmPin" className="text-sm text-gray-900 dark:text-white">Confirm PIN</Label>
            <Input
              id="confirmPin"
              type={showPin ? "text" : "password"}
              placeholder="Confirm PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center h-10"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex space-x-2">
            <Button 
              onClick={handleSetPin}
              disabled={pin.length !== 4 || confirmPin.length !== 4 || isLoading}
              className="flex-1 bg-fintech-orange hover:bg-fintech-orange/90 h-10"
              size="sm"
            >
              {isLoading ? 'Setting...' : 'Set PIN'}
            </Button>
            {allowSkip && (
              <Button 
                variant="outline" 
                onClick={onSkip}
                disabled={isLoading}
                className="flex-1 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 h-10"
                size="sm"
              >
                Skip
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PinSetup;

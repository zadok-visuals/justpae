import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { usePinAuth } from '@/hooks/usePinAuth';
import PinSetup from '@/components/PinSetup';
import PinVerification from '@/components/PinVerification';
import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, Fingerprint } from 'lucide-react';

const Security = () => {
  const { toast } = useToast();
  const { hasPin, setPin, isPinEnabled, setPinEnabled, deletePin, verifyPin } = usePinAuth();
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showPinVerification, setShowPinVerification] = useState(false);
  const [isFaceIdEnabled, setIsFaceIdEnabled] = useState(false);
  const [localPinEnabled, setLocalPinEnabled] = useState(false);

  useEffect(() => {
    setLocalPinEnabled(isPinEnabled());
  }, [isPinEnabled]);

  const handleSetPin = async (pin: string): Promise<boolean> => {
    const success = await setPin(pin);
    if (success) {
      setShowPinSetup(false);
      setLocalPinEnabled(true);
      setPinEnabled(true);
      toast({
        title: "Success",
        description: "PIN has been set successfully"
      });
    }
    return success;
  };

  const handleTogglePin = (enabled: boolean) => {
    if (enabled && !hasPin) {
      setShowPinSetup(true);
    } else if (enabled && hasPin) {
      setLocalPinEnabled(true);
      setPinEnabled(true);
      toast({
        title: "Success",
        description: "PIN has been enabled"
      });
    } else if (!enabled && hasPin) {
      setLocalPinEnabled(false);
      setPinEnabled(false);
      toast({
        title: "Success",
        description: "PIN has been disabled"
      });
    }
  };

  const handleChangePinRequest = () => {
    if (hasPin) {
      setShowPinVerification(true);
    } else {
      setShowPinSetup(true);
    }
  };

  const handlePinVerificationSuccess = async (pin: string): Promise<boolean> => {
    const isValid = await verifyPin(pin);
    if (isValid) {
      setShowPinVerification(false);
      setShowPinSetup(true);
      return true;
    }
    return false;
  };

  const handleToggleFaceId = (enabled: boolean) => {
    if (enabled) {
      // Simulate Face ID setup
      setTimeout(() => {
        setIsFaceIdEnabled(true);
        toast({
          title: "Success",
          description: "Face ID has been enabled"
        });
      }, 1000);
    } else {
      setIsFaceIdEnabled(false);
      toast({
        title: "Success",
        description: "Face ID has been disabled"
      });
    }
  };

  return (
    <>
      <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col relative min-h-screen">
        <div className="flex-1 w-full max-w-2xl mx-auto p-4 pb-24 space-y-6">
          {/* Header */}
          <div className="flex items-center space-x-4">
            <Link to="/settings">
              <Button variant="ghost" size="sm" className="p-2 text-gray-600 dark:text-gray-300">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Security Settings</h1>
          </div>

          {/* PIN Settings */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-white">
                <Lock className="w-5 h-5 text-fintech-orange" />
                <span>PIN Protection</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Enable PIN</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Secure your app with a 4-digit PIN</p>
                </div>
                <Switch
                  checked={localPinEnabled}
                  onCheckedChange={handleTogglePin}
                  className="data-[state=checked]:bg-fintech-orange dark:data-[state=checked]:bg-fintech-orange border-fintech-orange"
                />
              </div>

              {hasPin && (
                <Button 
                  variant="outline" 
                  onClick={handleChangePinRequest}
                  className="w-full border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Change PIN
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Face ID Settings */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-white">
                <Fingerprint className="w-5 h-5 text-fintech-orange" />
                <span>Biometric Authentication</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Face ID / Fingerprint</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Use biometric authentication to sign in</p>
                </div>
                <Switch
                  checked={isFaceIdEnabled}
                  onCheckedChange={handleToggleFaceId}
                  className="data-[state=checked]:bg-fintech-orange dark:data-[state=checked]:bg-fintech-orange"
                />
              </div>
            </CardContent>
          </Card>

          {/* Additional Security Options */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Additional Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Link to="/change-password">
                <Button variant="outline" className="w-full justify-start border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700">
                  Change Password
                </Button>
              </Link>
              <Link to="/two-factor-auth">
                <Button variant="outline" className="w-full justify-start border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700">
                  Two-Factor Authentication
                </Button>
              </Link>
              <Button variant="outline" className="w-full justify-start border-gray-200 dark:border-gray-700 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
                Reset Security Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {showPinSetup && (
        <PinSetup
          onPinSet={handleSetPin}
          onSkip={() => setShowPinSetup(false)}
          title={hasPin ? "Change Your PIN" : "Set Up Your Security PIN"}
          description={hasPin ? "Enter a new 4-digit PIN" : "Create a 4-digit PIN to secure your transactions"}
          allowSkip={!hasPin}
        />
      )}

      {showPinVerification && (
        <PinVerification
          onVerify={handlePinVerificationSuccess}
          onCancel={() => setShowPinVerification(false)}
          title="Verify Current PIN"
          description="Enter your current PIN to change it"
        />
      )}
    </>
  );
};

export default Security;

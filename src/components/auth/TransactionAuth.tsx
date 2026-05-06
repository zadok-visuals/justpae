
import React, { useState, useEffect } from 'react';
import { usePinAuth } from '@/hooks/usePinAuth';
import PinVerification from '@/components/PinVerification';
import PinSetup from '@/components/PinSetup';
import { useToast } from '@/hooks/use-toast';

interface TransactionAuthProps {
  onSuccess: () => void;
  onCancel: () => void;
  transactionType: string;
  amount?: string;
  children: React.ReactNode;
}

const TransactionAuth: React.FC<TransactionAuthProps> = ({
  onSuccess,
  onCancel,
  transactionType,
  amount,
  children
}) => {
  const { hasPin, verifyPin, setPin, loading } = usePinAuth();
  const { toast } = useToast();
  const [showAuth, setShowAuth] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);

  // Don't render anything while loading PIN status
  if (loading) {
    return (
      <div className="opacity-50 cursor-not-allowed">
        {children}
      </div>
    );
  }

  const handleTransactionClick = () => {
    if (hasPin === false) {
      // User has no PIN - show setup
      setShowPinSetup(true);
    } else if (hasPin === true) {
      // User has PIN - show verification
      setShowAuth(true);
    } else {
      // PIN status unknown - proceed without verification (fallback)
      onSuccess();
    }
  };

  const handlePinVerification = async (pin: string): Promise<boolean> => {
    const isValid = await verifyPin(pin);
    if (isValid) {
      setShowAuth(false);
      onSuccess();
      return true;
    }
    return false;
  };

  const handlePinSetup = async (pin: string): Promise<boolean> => {
    const success = await setPin(pin);
    if (success) {
      setShowPinSetup(false);
      onSuccess();
      toast({
        title: "PIN Set Successfully",
        description: "Your transaction PIN has been created and secured",
      });
    }
    return success;
  };

  const handleCancel = () => {
    setShowAuth(false);
    setShowPinSetup(false);
    onCancel();
  };

  if (showPinSetup) {
    return (
      <PinSetup
        onPinSet={handlePinSetup}
        onSkip={handleCancel}
        title="Set Transaction PIN"
        description="Create a 4-digit PIN to secure your transactions"
        allowSkip={false}
      />
    );
  }

  if (showAuth) {
    return (
      <PinVerification
        onVerify={handlePinVerification}
        onCancel={handleCancel}
        title="Verify Transaction"
        description={`Enter your PIN to confirm this ${transactionType}${amount ? ` of ${amount}` : ''}`}
      />
    );
  }

  return (
    <div onClick={handleTransactionClick}>
      {children}
    </div>
  );
};

export default TransactionAuth;

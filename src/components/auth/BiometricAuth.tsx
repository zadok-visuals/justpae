
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Fingerprint } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BiometricAuthProps {
  onSuccess: () => void;
  onFallback: () => void;
}

const BiometricAuth: React.FC<BiometricAuthProps> = ({ onSuccess, onFallback }) => {
  const { toast } = useToast();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleBiometricAuth = async () => {
    setIsAuthenticating(true);
    
    try {
      // Check if WebAuthn is supported
      if (window.PublicKeyCredential) {
        // This is a simplified implementation
        // In a real app, you'd integrate with WebAuthn or platform-specific APIs
        toast({
          title: "Biometric Authentication",
          description: "Feature coming soon. Using PIN authentication for now.",
        });
        onFallback();
      } else {
        toast({
          title: "Biometric Not Supported",
          description: "Your device doesn't support biometric authentication.",
          variant: "destructive"
        });
        onFallback();
      }
    } catch (error) {
      toast({
        title: "Authentication Failed",
        description: "Falling back to PIN authentication.",
        variant: "destructive"
      });
      onFallback();
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="text-center space-y-4">
      <Fingerprint className="w-16 h-16 mx-auto text-fintech-orange" />
      <h3 className="text-lg font-semibold">Biometric Authentication</h3>
      <p className="text-gray-600">Use your fingerprint or Face ID to authenticate</p>
      
      <div className="space-y-3">
        <Button
          onClick={handleBiometricAuth}
          disabled={isAuthenticating}
          className="w-full bg-fintech-orange hover:bg-fintech-orange/90"
        >
          {isAuthenticating ? 'Authenticating...' : 'Use Biometric'}
        </Button>
        
        <Button
          onClick={onFallback}
          variant="outline"
          className="w-full"
        >
          Use PIN Instead
        </Button>
      </div>
    </div>
  );
};

export default BiometricAuth;

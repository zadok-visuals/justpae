
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/Layout';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Smartphone, Key, Copy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const TwoFactorAuth = () => {
  const { toast } = useToast();
  const { initializeMFA, verifyMFA, checkMFAStatus, listFactors } = useAuth();
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isEnabling, setIsEnabling] = useState(false);
  const [step, setStep] = useState<'setup' | 'verify' | 'complete'>('setup');
  const [isVerifyMode, setIsVerifyMode] = useState(false);

  useEffect(() => {
    checkStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get('verify') === 'true') {
      setIsVerifyMode(true);
      prepareVerification();
    }
  }, []);

  const prepareVerification = async () => {
    const result = await listFactors();
    if ('data' in result && result.data?.totp) {
      const verifiedFactor = result.data.totp.find((f: any) => f.status === 'verified');
      if (verifiedFactor) {
        setFactorId(verifiedFactor.id);
        setStep('verify');
      }
    }
  };

  const checkStatus = async () => {
    const enabled = await checkMFAStatus();
    setIs2FAEnabled(enabled);
  };

  const handleEnable2FA = async () => {
    setIsEnabling(true);

    try {
      const result = await initializeMFA();
      if ('error' in result) {
        throw new Error(result.error);
      }

      setQrCode(result.qr);
      setSecret(result.secret);
      setFactorId(result.id);
      setStep('verify');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to setup 2FA. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsEnabling(false);
    }
  };

  const handleVerify2FA = async () => {
    if (verificationCode.length !== 6) {
      toast({
        title: "Error",
        description: "Please enter a 6-digit verification code",
        variant: "destructive"
      });
      return;
    }

    try {
      const result = await verifyMFA(factorId, verificationCode);
      if (result.error) {
        throw new Error(result.error);
      }

      setIs2FAEnabled(true);
      setStep('complete');

      toast({
        title: "Success",
        description: isVerifyMode ? "Identity verified successfully" : "Two-factor authentication has been enabled successfully"
      });

      if (isVerifyMode) {
        // Add a small delay then redirect back
        setTimeout(() => {
          window.history.back();
        }, 1500);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Invalid verification code. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Note: Disabling 2FA typically requires un-enrolling the factor via API.
  // For now, we'll keep it simple and just show the status.
  // The 'switch' could just trigger a toast saying contact support or implement unenroll if API allows.
  const handleDisable2FA = async () => {
    toast({
      title: "Notice",
      description: "To disable 2FA, please contact support or delete the authenticator from your security settings (not implemented in this demo).",
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Code copied to clipboard"
    });
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="p-4 pb-24 space-y-6">
          {/* Header */}
          <div className="flex items-center space-x-4">
            <Link to="/security">
              <Button variant="ghost" size="sm" className="p-2 text-gray-600 dark:text-gray-300">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Two-Factor Authentication</h1>
          </div>

          {/* Status Card */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-white">
                <Shield className="w-5 h-5 text-fintech-orange" />
                <span>2FA Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {is2FAEnabled ? 'Enabled' : 'Disabled'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {is2FAEnabled
                      ? 'Your account is protected with 2FA'
                      : 'Add an extra layer of security to your account'
                    }
                  </p>
                </div>
                {!is2FAEnabled && (
                  <Button
                    onClick={handleEnable2FA}
                    disabled={isEnabling}
                    size="sm"
                  >
                    {isEnabling ? 'Setting up...' : 'Enable'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Setup Process */}
          {!is2FAEnabled && step === 'verify' && (
            <div className="space-y-6">
              <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-white">
                    <Smartphone className="w-5 h-5 text-fintech-orange" />
                    <span>Scan QR Code</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                  <div className="flex justify-center">
                    {/* Display QR Code */}
                    <img src={qrCode} alt="2FA QR Code" className="w-48 h-48 rounded-lg border p-2 bg-white" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-900 dark:text-white">Or enter this secret key manually:</Label>
                    <div className="flex items-center space-x-2 justify-center">
                      <code className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm text-gray-900 dark:text-white">
                        {secret}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(secret)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4">
                    <Label htmlFor="verificationCode" className="text-gray-900 dark:text-white">Enter 6-digit code</Label>
                    <Input
                      id="verificationCode"
                      placeholder="000000"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      className="text-center text-xl font-mono bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <Button
                    onClick={handleVerify2FA}
                    disabled={verificationCode.length !== 6}
                    className="w-full bg-fintech-orange hover:bg-fintech-orange/90"
                  >
                    Verify and Enable 2FA
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {step === 'complete' && (
            <Card className="rounded-2xl shadow-sm bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CardContent className="pt-6">
                <div className="text-center space-y-2">
                  <h3 className="text-green-800 dark:text-green-200 font-semibold">Setup Complete!</h3>
                  <p className="text-green-700 dark:text-green-300 text-sm">
                    Next time you login, you will be asked to provide a verification code from your authenticator app.
                  </p>
                  <Link to="/security">
                    <Button variant="outline" className="mt-4">
                      Back to Security
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Information Card */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">About Two-Factor Authentication</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-fintech-orange rounded-full mt-1.5"></div>
                  <span>Adds an extra layer of security to your account</span>
                </li>
                <li className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-fintech-orange rounded-full mt-1.5"></div>
                  <span>Requires both your password and a code from your phone</span>
                </li>
                <li className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-fintech-orange rounded-full mt-1.5"></div>
                  <span>Protects against unauthorized access even if your password is compromised</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default TwoFactorAuth;

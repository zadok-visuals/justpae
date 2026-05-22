import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { paystackService } from '@/services/paystackService';
import { useTransactionLimits } from '@/hooks/useTransactionLimits';
import { ArrowLeft, CreditCard, ShieldCheck, AlertTriangle } from 'lucide-react';

const Deposit = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const { maxTransactionAmount, kycRequiredThreshold, isLoaded } = useTransactionLimits();

  const handleContinue = async () => {
    if (!amount) {
      toast({
        title: "Error",
        description: "Please enter an amount",
        variant: "destructive"
      });
      return;
    }

    const depositAmount = parseFloat(amount);
    if (depositAmount <= 0 || isNaN(depositAmount)) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive"
      });
      return;
    }

    if (depositAmount < 100) {
      toast({
        title: "Error",
        description: "Minimum deposit amount is ₦100",
        variant: "destructive"
      });
      return;
    }

    // Enforce admin-configured maximum transaction amount
    if (depositAmount > maxTransactionAmount) {
      toast({
        title: "Amount Exceeds Limit",
        description: `The maximum deposit per transaction is ₦${maxTransactionAmount.toLocaleString('en-NG')}. Please reduce your amount.`,
        variant: "destructive"
      });
      return;
    }

    // Enforce KYC threshold — block transaction if user isn't verified
    if (depositAmount >= kycRequiredThreshold && !profile?.is_kyc_verified) {
      toast({
        title: "KYC Verification Required",
        description: `Transactions of ₦${kycRequiredThreshold.toLocaleString('en-NG')} or more require identity verification. Please complete KYC first.`,
        variant: "destructive"
      });
      navigate('/kyc');
      return;
    }

    if (!user?.email) {
      toast({ title: "Error", description: "User email not found", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const result = await paystackService.initializeTransaction({
        email: user.email,
        amount: depositAmount,
        metadata: {
          user_id: user.id,
          transaction_type: 'deposit'
        }
      });

      if (result && result.status && result.data.authorization_url) {
        localStorage.setItem('pending_deposit_reference', result.data.reference);
        localStorage.setItem('pending_deposit_amount', depositAmount.toString());

        // Redirect to Paystack's hosted checkout page instead of using the inline script.
        // This completely bypasses all frontend environment variable issues and guarantees
        // it works perfectly across local and live environments.
        window.location.href = result.data.authorization_url;
      } else {
        throw new Error(result?.message || 'Failed to initialize payment');
      }
    } catch (error: any) {
      toast({
        title: "Payment Initialization Failed",
        description: error.message || "Could not connect to payment gateway",
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  return (
    <div className="p-4 pb-24 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">

      {/* Header */}
      <div className="flex items-center space-x-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="p-2 text-gray-600 dark:text-gray-300"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Add Money</h1>
          <p className="text-gray-600 dark:text-gray-400">Fund your wallet securely</p>
        </div>
      </div>

      {/* Main Deposit Card */}
      <Card className="rounded-2xl shadow-sm border-2 border-fintech-orange/20 bg-white dark:bg-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
            <CreditCard className="w-5 h-5 text-fintech-orange" />
            <span>Add Naira to Your Wallet</span>
          </CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Enter the amount and choose how to pay on the next screen
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="amount" className="text-gray-900 dark:text-white font-medium">
              Amount (NGN)
            </Label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-semibold">₦</span>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-8 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-lg font-semibold"
                min="100"
              />
            </div>
            {amount && parseFloat(amount) > 0 && (
              <p className="text-sm text-fintech-orange font-medium mt-1">
                You will deposit ₦{parseFloat(amount).toLocaleString('en-NG')}
              </p>
            )}
          </div>

          <Button
            id="deposit-continue-btn"
            onClick={handleContinue}
            disabled={loading || !amount}
            className="w-full bg-fintech-orange hover:bg-fintech-orange/90 py-6 text-base font-semibold"
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                <span>Connecting to Paystack...</span>
              </span>
            ) : (
              `Continue${amount ? ` with ₦${parseFloat(amount).toLocaleString('en-NG')}` : ''}`
            )}
          </Button>

          {/* Powered by Paystack */}
          <div className="flex items-center justify-center space-x-2 pt-1">
            <ShieldCheck className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Secured & powered by{' '}
              <span className="font-semibold text-gray-500 dark:text-gray-400">Paystack</span>
              {' '}· Card · Transfer · Bank · USSD
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Important Information */}
      <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-gray-900 dark:text-white">Important Information</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start">
              <span className="text-fintech-orange mr-2 mt-0.5">•</span>
              <span>Minimum deposit: ₦100</span>
            </li>
            <li className="flex items-start">
              <span className="text-fintech-orange mr-2 mt-0.5">•</span>
              <span>Maximum deposit: ₦{maxTransactionAmount.toLocaleString('en-NG')} per transaction</span>
            </li>
            {!profile?.is_kyc_verified && (
              <li className="flex items-start text-amber-600 dark:text-amber-500">
                <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                <span>Transactions of ₦{kycRequiredThreshold.toLocaleString('en-NG')} or more require KYC verification.</span>
              </li>
            )}
            <li className="flex items-start">
              <span className="text-fintech-orange mr-2 mt-0.5">•</span>
              <span>Card payments are instant</span>
            </li>
            <li className="flex items-start">
              <span className="text-fintech-orange mr-2 mt-0.5">•</span>
              <span>Bank transfers are processed within 5–15 minutes</span>
            </li>
            <li className="flex items-start">
              <span className="text-fintech-orange mr-2 mt-0.5">•</span>
              <span>All transactions are secured with bank-level encryption</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default Deposit;

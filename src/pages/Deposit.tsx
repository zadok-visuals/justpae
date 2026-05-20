import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/contexts/WalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { paystackService } from '@/services/paystackService';
import CardPaymentForm from '@/components/CardPaymentForm';
import StableBankAccountDetails from '@/components/StableBankAccountDetails';
import { ArrowLeft, CreditCard, Building, Smartphone } from 'lucide-react';

const Deposit = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { depositFiat } = useWallet();
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const handleContinue = async () => {
    if (!amount || !paymentMethod) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    const depositAmount = parseFloat(amount);
    if (depositAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive"
      });
      return;
    }

    if (paymentMethod === 'debit_card') {
      await handlePaystackDeposit(depositAmount);
    } else {
      setShowPaymentForm(true);
    }
  };

  const handlePaystackDeposit = async (depositAmount: number) => {
    if (!user?.email) {
      toast({ title: "Error", description: "User email not found", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    try {
      const result = await paystackService.initializeTransaction({
        email: user.email,
        amount: depositAmount * 100, // Convert NGN to kobo
        metadata: {
          user_id: user.id,
          transaction_type: 'deposit'
        }
      });
      
      if (result && result.status && result.data.authorization_url) {
        localStorage.setItem('pending_deposit_reference', result.data.reference);
        localStorage.setItem('pending_deposit_amount', depositAmount.toString());
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
    } finally {
      setLoading(false);
    }
  };

  const handleBankTransfer = async () => {
    setLoading(true);
    try {
      const depositAmount = parseFloat(amount);
      const result = await depositFiat(depositAmount, paymentMethod);
      
      if (result.success) {
        toast({
          title: "Transfer Initiated",
          description: `Please complete the transfer using the details above. Your wallet will be credited automatically.`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCardPayment = async (cardData: any) => {
    await handlePaystackDeposit(cardData.amount);
  };

  if (showPaymentForm && paymentMethod === 'debit_card') {
    return (

        <div className="p-4 pb-24 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
          <div className="flex items-center space-x-4 mb-6">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowPaymentForm(false)}
              className="p-2 text-gray-600 dark:text-gray-300"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Card Payment</h1>
              <p className="text-gray-600 dark:text-gray-400">Enter your card details to complete payment</p>
            </div>
          </div>

          <CardPaymentForm
            amount={amount}
            onSubmit={handleCardPayment}
            loading={loading}
          />
        </div>

    );
  }

  if (showPaymentForm && (paymentMethod === 'bank_transfer' || paymentMethod === 'ussd')) {
    return (

        <div className="p-4 pb-24 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
          <div className="flex items-center space-x-4 mb-6">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowPaymentForm(false)}
              className="p-2 text-gray-600 dark:text-gray-300"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Complete Transfer</h1>
              <p className="text-gray-600 dark:text-gray-400">Use the details below to complete your deposit</p>
            </div>
          </div>

          <StableBankAccountDetails
            amount={amount}
            paymentMethod={paymentMethod}
          />

          <Button 
            onClick={handleBankTransfer}
            disabled={loading}
            className="w-full bg-fintech-orange hover:bg-fintech-orange/90"
          >
            {loading ? 'Processing...' : 'I have completed the transfer'}
          </Button>
        </div>

    );
  }

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

        {/* Fiat Deposit Card */}
        <Card className="rounded-2xl shadow-sm border-2 border-fintech-orange/20 bg-white dark:bg-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
              <CreditCard className="w-5 h-5 text-fintech-orange" />
              <span>Add Naira to Your Wallet</span>
            </CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400">Choose your preferred payment method to add money</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="amount" className="text-gray-900 dark:text-white">Amount (NGN)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <Label htmlFor="payment-method" className="text-gray-900 dark:text-white">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="w-full mt-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectItem value="bank_transfer" className="text-gray-900 dark:text-white">
                    <div className="flex items-center space-x-2">
                      <Building className="w-4 h-4" />
                      <span>Bank Transfer</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="debit_card" className="text-gray-900 dark:text-white">
                    <div className="flex items-center space-x-2">
                      <CreditCard className="w-4 h-4" />
                      <span>Debit Card</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ussd" className="text-gray-900 dark:text-white">
                    <div className="flex items-center space-x-2">
                      <Smartphone className="w-4 h-4" />
                      <span>USSD</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleContinue}
              disabled={!amount || !paymentMethod}
              className="w-full bg-fintech-orange hover:bg-fintech-orange/90"
            >
              Continue with ₦{amount || '0'}
            </Button>
          </CardContent>
        </Card>

        {/* Payment Methods Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="text-center p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <Building className="w-8 h-8 text-fintech-orange mx-auto mb-2" />
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Bank Transfer</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">5-15 minutes</p>
          </Card>
          <Card className="text-center p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CreditCard className="w-8 h-8 text-fintech-orange mx-auto mb-2" />
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Debit Card</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">Instant</p>
          </Card>
          <Card className="text-center p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <Smartphone className="w-8 h-8 text-fintech-orange mx-auto mb-2" />
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">USSD</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">2-5 minutes</p>
          </Card>
        </div>

        {/* Important Information */}
        <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg text-gray-900 dark:text-white">Important Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <ul className="space-y-2">
                <li className="flex items-start">
                  <span className="text-fintech-orange mr-2">•</span>
                  <span>Minimum deposit: ₦100</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-orange mr-2">•</span>
                  <span>Maximum deposit: ₦5,000,000 per transaction</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-orange mr-2">•</span>
                  <span>Bank transfers are processed within 5-15 minutes</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-orange mr-2">•</span>
                  <span>Card payments are instant but may have additional fees</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-orange mr-2">•</span>
                  <span>All transactions are secured with bank-level encryption</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

  );
};

export default Deposit;

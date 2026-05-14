import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { paystackService } from '@/services/paystackService';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CreditCard, CheckCircle } from 'lucide-react';

const PaymentTest: React.FC = () => {
  const [amount, setAmount] = useState('1000');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleTestPayment = async () => {
    if (!email || !amount) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const transactionData = {
        email,
        amount: parseFloat(amount),
        metadata: {
          user_id: user?.id || 'test-user',
          transaction_type: 'test_payment'
        }
      };

      const response = await paystackService.initializeTransaction(transactionData);
      
      if (response?.status) {
        setLastTransaction(response);
        toast({
          title: "Payment Initialized",
          description: "Opening Paystack checkout...",
        });
        
        // Open Paystack checkout in new tab
        window.open(response.data.authorization_url, '_blank');
      } else {
        throw new Error('Failed to initialize payment');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to initialize payment",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPayment = async () => {
    if (!lastTransaction?.data?.reference) {
      toast({
        title: "Error",
        description: "No transaction to verify",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const verification = await paystackService.verifyTransaction(lastTransaction.data.reference);
      
      if (verification?.status) {
        toast({
          title: "Payment Verified",
          description: `Status: ${verification.data.status}`,
          variant: verification.data.status === 'success' ? 'default' : 'destructive'
        });
      } else {
        throw new Error('Verification failed');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to verify payment",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Paystack Live Payment Test
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200">Live Payment Testing</h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      This will process real payments using your live Paystack keys. Use test amounts and your own email for testing.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your-email@example.com"
                  />
                </div>

                <div>
                  <Label htmlFor="amount">Amount (NGN)</Label>
                  <Input
                    id="amount"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="1000"
                    min="100"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Minimum: ₦100. Use small amounts for testing.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleTestPayment}
                    disabled={loading}
                    className="flex-1"
                  >
                    {loading ? 'Processing...' : 'Initialize Payment'}
                  </Button>
                  
                  {lastTransaction && (
                    <Button
                      onClick={handleVerifyPayment}
                      disabled={loading}
                      variant="outline"
                    >
                      Verify Payment
                    </Button>
                  )}
                </div>
              </div>

              {lastTransaction && (
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Last Transaction
                  </h4>
                  <div className="text-sm space-y-1">
                    <p><strong>Reference:</strong> {lastTransaction.data.reference}</p>
                    <p><strong>Access Code:</strong> {lastTransaction.data.access_code}</p>
                    <p><strong>Authorization URL:</strong> 
                      <a 
                        href={lastTransaction.data.authorization_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline ml-1"
                      >
                        Open Checkout
                      </a>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Testing Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div>
                  <h4 className="font-medium">1. Initialize Payment</h4>
                  <p className="text-muted-foreground">Enter your email and a test amount, then click "Initialize Payment"</p>
                </div>
                <div>
                  <h4 className="font-medium">2. Complete Payment</h4>
                  <p className="text-muted-foreground">A new tab will open with Paystack checkout. Use a test card or your own card for small amounts</p>
                </div>
                <div>
                  <h4 className="font-medium">3. Verify Payment</h4>
                  <p className="text-muted-foreground">Return to this page and click "Verify Payment" to confirm the transaction status</p>
                </div>
                <div>
                  <h4 className="font-medium">4. Check Wallet</h4>
                  <p className="text-muted-foreground">If successful, the amount should be added to your wallet balance</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

  );
};

export default PaymentTest;
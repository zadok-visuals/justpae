
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/contexts/WalletContext';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { paystackService } from '@/services/paystackService';

const PaymentCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refreshData } = useWallet();
  const [status, setStatus] = useState<'loading' | 'success' | 'completed' | 'failed'>('loading');
  const [message, setMessage] = useState('Processing your payment...');
  const hasRun = React.useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const verifyPayment = async () => {
      const reference = searchParams.get('reference');
      const paystackReference = searchParams.get('trxref');
      
      const finalReference = reference || paystackReference;
      
      if (!finalReference) {
        setStatus('failed');
        setMessage('Invalid payment reference');
        return;
      }

      try {
        // Verify with Paystack
        const verification = await paystackService.verifyTransaction(finalReference);
        
        if (verification && verification.status && verification.data.status === 'success') {
          // The edge function already credited the wallet using the service role key.
          // We just need to refresh the local state from the database.
          const amount = verification.data.amount / 100; // Convert from kobo to NGN

          // Pull the newly updated balance from Supabase into the context
          await refreshData();
          
          // Clear stored data
          localStorage.removeItem('pending_deposit_reference');
          localStorage.removeItem('pending_deposit_amount');

          setStatus('success');
          setMessage(`Successfully deposited ₦${amount.toLocaleString()}`);
          
          toast({
            title: "Payment Successful",
            description: `₦${amount.toLocaleString()} has been added to your account`
          });
        } else {
          setStatus('failed');
          setMessage('Payment verification failed or transaction was not successful.');
        }
      } catch (error) {
        console.error('Payment verification error:', error);
        setStatus('failed');
        setMessage('Payment verification failed');
        
        toast({
          title: "Payment Error",
          description: "There was an issue verifying your payment",
          variant: "destructive"
        });
      }
    };

    verifyPayment();
  }, [searchParams, refreshData, toast]);

  const handleContinue = () => {
    if (status === 'success') {
      navigate('/wallet');
    } else {
      navigate('/deposit');
    }
  };

  return (
      <div className="p-4 pb-24 space-y-6 bg-gray-50 min-h-screen">
        <div className="max-w-md mx-auto mt-20">
          <Card className="rounded-2xl shadow-lg">
            <CardContent className="p-8 text-center">
              {status === 'loading' && (
                <div className="space-y-4">
                  <Loader2 className="w-16 h-16 mx-auto text-fintech-orange animate-spin" />
                  <h2 className="text-xl font-semibold">Processing Payment</h2>
                  <p className="text-gray-600">{message}</p>
                </div>
              )}
              
              {status === 'success' && (
                <div className="space-y-4">
                  <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
                  <h2 className="text-xl font-semibold text-green-700">Payment Successful!</h2>
                  <p className="text-gray-600">{message}</p>
                  <Button 
                    onClick={handleContinue}
                    className="w-full bg-green-500 hover:bg-green-600"
                  >
                    View Wallet
                  </Button>
                </div>
              )}
              
              {status === 'failed' && (
                <div className="space-y-4">
                  <XCircle className="w-16 h-16 mx-auto text-red-500" />
                  <h2 className="text-xl font-semibold text-red-700">Payment Failed</h2>
                  <p className="text-gray-600">{message}</p>
                  <Button 
                    onClick={handleContinue}
                    className="w-full bg-fintech-orange hover:bg-fintech-orange-light"
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
  );
};

export default PaymentCallback;

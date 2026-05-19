
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/contexts/WalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import BankAccountManager from '@/components/BankAccountManager';
import { ArrowLeft } from 'lucide-react';
import { cryptoService } from '@/services/cryptoService';

interface BankAccount {
  id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  bank_code?: string;
  is_default: boolean;
  is_verified: boolean;
}

const Withdraw = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { fiatBalance, withdrawFiat } = useWallet();
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(1650);

  // Fetch current exchange rate
  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const rate = await cryptoService.getExchangeRate();
        setExchangeRate(rate);
      } catch (error) {
        console.error('Error fetching exchange rate:', error);
      }
    };

    fetchExchangeRate();
    const interval = setInterval(fetchExchangeRate, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const usdEquivalent = amount ? (parseFloat(amount) / exchangeRate) : 0;

  const handleAccountSelect = (account: BankAccount) => {
    setSelectedAccount(account);
  };

  const handleWithdraw = async () => {
    if (!amount || !selectedAccount) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    const withdrawAmount = parseFloat(amount);
    if (withdrawAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive"
      });
      return;
    }

    if (withdrawAmount < 1000) {
      toast({
        title: "Error",
        description: "Minimum withdrawal amount is ₦1,000",
        variant: "destructive"
      });
      return;
    }

    if (withdrawAmount > 2000000) {
      toast({
        title: "Error",
        description: "Maximum withdrawal amount is ₦2,000,000",
        variant: "destructive"
      });
      return;
    }

    if (withdrawAmount + 50 > fiatBalance) {
      toast({
        title: "Error",
        description: "Insufficient balance (including ₦50 processing fee)",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const result = await withdrawFiat(withdrawAmount, selectedAccount.id);
      
      if (result.success) {
        // Send a message to admin chat
        if (user) {
          // Find or create conversation
          const { data: convData } = await supabase
            .from('chat_conversations')
            .select('id')
            .eq('user_id', user.id)
            .single();
            
          if (convData) {
            await supabase.from('chat_messages').insert({
              conversation_id: convData.id,
              sender_id: user.id,
              sender_type: 'user',
              message_type: 'text',
              content: `📤 WITHDRAWAL REQUEST\nAmount: ₦${withdrawAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\nBank: ${selectedAccount.bank_name}\nAccount: ${selectedAccount.account_number}\nName: ${selectedAccount.account_name}\nPlease process this withdrawal to my bank account.`
            });
          }
        }

        toast({
          title: "Withdrawal Initiated",
          description: `Your withdrawal of ₦${withdrawAmount.toLocaleString()} is being processed.`,
        });
        setAmount('');
        setSelectedAccount(null);
        navigate('/wallet');
      } else {
        toast({
          title: "Withdrawal Failed",
          description: result.error || "Please try again later",
          variant: "destructive"
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Withdraw Money</h1>
            <p className="text-gray-600 dark:text-gray-400">Transfer money from your wallet to your bank account</p>
          </div>
        </div>

        {/* Balance Display */}
        <Card className="rounded-2xl shadow-sm fintech-gradient-blue text-white">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm opacity-90 mb-2">Available Balance</p>
              <h2 className="text-3xl font-bold mb-2">₦{fiatBalance.toLocaleString()}</h2>
              <p className="text-sm opacity-90">≈ ${(fiatBalance / exchangeRate).toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Withdrawal Form */}
        <Card className="rounded-2xl shadow-sm border-2 border-fintech-orange/20 bg-white dark:bg-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Withdrawal Details
            </CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400">Enter the amount and select bank account</p>
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
                min="1000"
                max="2000000"
              />
              <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mt-2">
                <span>Available: ₦{fiatBalance.toLocaleString()}</span>
                {amount && (
                  <span>USD equivalent: ${usdEquivalent.toFixed(2)}</span>
                )}
              </div>
            </div>

            <BankAccountManager
              selectedAccountId={selectedAccount?.id}
              onAccountSelect={handleAccountSelect}
            />

            {amount && selectedAccount && (
              <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg space-y-2 border border-green-200 dark:border-green-800">
                <h3 className="font-semibold text-green-900 dark:text-green-100">Withdrawal Summary</h3>
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">Amount:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₦{parseFloat(amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">USD equivalent:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">${usdEquivalent.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">Bank Account:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{selectedAccount.account_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">Processing fee:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₦50</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-semibold text-gray-900 dark:text-white">Total deduction:</span>
                  <span className="font-bold text-green-600 dark:text-green-400">₦{(parseFloat(amount) + 50).toLocaleString()}</span>
                </div>
              </div>
            )}

            <Button 
              onClick={handleWithdraw}
              disabled={loading || !amount || !selectedAccount || parseFloat(amount) < 1000}
              className="w-full bg-fintech-orange hover:bg-fintech-orange/90 py-3"
            >
              {loading ? 'Processing...' : `Withdraw ₦${amount || '0'}`}
            </Button>
          </CardContent>
        </Card>

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
                  <span>Withdrawals are processed within 24 hours</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-orange mr-2">•</span>
                  <span>A flat processing fee of ₦50 is applied to each withdrawal</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-orange mr-2">•</span>
                  <span>Minimum withdrawal amount: ₦1,000</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-orange mr-2">•</span>
                  <span>Maximum withdrawal amount: ₦2,000,000 per transaction</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-orange mr-2">•</span>
                  <span>You can add up to 3 bank accounts</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-orange mr-2">•</span>
                  <span>Make sure your bank details are correct before initiating withdrawal</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
  );
};

export default Withdraw;

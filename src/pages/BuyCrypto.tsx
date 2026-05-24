import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, MessageSquare, ShieldCheck, Zap, RefreshCw, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cryptoService, CryptoPrice } from '@/services/cryptoService';
import { vaspService } from '@/services/vaspService';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useTransactionLimits } from '@/hooks/useTransactionLimits';

const BuyCrypto = () => {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { maxTransactionAmount, kycRequiredThreshold } = useTransactionLimits();
  const [selectedCrypto, setSelectedCrypto] = useState('BTC');
  const [usdAmount, setUsdAmount] = useState('');
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPrice[]>([]);
  const [exchangeRate, setExchangeRate] = useState(1650);
  const [fetching, setFetching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const cryptoOptions = [
    { 
      symbol: 'BTC', 
      name: 'Bitcoin', 
      icon: '₿',
      color: 'text-amber-500'
    },
    { 
      symbol: 'ETH', 
      name: 'Ethereum', 
      icon: 'Ξ',
      color: 'text-blue-500'
    },
    { 
      symbol: 'USDT', 
      name: 'Tether', 
      icon: '₮',
      color: 'text-emerald-500'
    }
  ];

  const fetchPrices = async () => {
    try {
      setFetching(true);
      const { prices, buyRate } = await cryptoService.getCombinedPrices();
      
      const mappedPrices = prices.map(price => {
        if (price.symbol === 'BTC') return { ...price, symbol: 'BTC' };
        if (price.symbol === 'ETH') return { ...price, symbol: 'ETH' };
        return price;
      });
      
      mappedPrices.push({
        symbol: 'USDT',
        price: 1,
        change24h: 0,
        volume24h: 0
      });
      
      setCryptoPrices(mappedPrices);
      setExchangeRate(buyRate);
    } catch (error) {
      console.error('Error fetching prices:', error);
      setCryptoPrices([
        { symbol: 'BTC', price: 65000, change24h: 2.5, volume24h: 20000000000 },
        { symbol: 'ETH', price: 2500, change24h: 1.8, volume24h: 12000000000 },
        { symbol: 'USDT', price: 1, change24h: 0, volume24h: 5000000000 }
      ]);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  const getCurrentPrice = (symbol: string) => {
    const crypto = cryptoPrices.find(c => c.symbol === symbol);
    return crypto?.price || 0;
  };

  const selectedCryptoData = cryptoOptions.find(crypto => crypto.symbol === selectedCrypto);
  const currentPrice = getCurrentPrice(selectedCrypto);
  const usdValue = usdAmount ? parseFloat(usdAmount) : 0;
  const nairaEquivalent = usdValue * exchangeRate;
  const cryptoAmount = selectedCryptoData && currentPrice ? (usdValue / currentPrice) : 0;

  const handleExecuteTrade = async () => {
    if (!usdAmount || parseFloat(usdAmount) <= 0) {
      toast({
        title: 'Enter an Amount',
        description: 'Please enter a USD amount.',
        variant: 'destructive',
      });
      return;
    }

    if (nairaEquivalent > maxTransactionAmount) {
      toast({
        title: 'Amount Exceeds Limit',
        description: `The maximum per transaction is ₦${maxTransactionAmount.toLocaleString('en-NG')}.`,
        variant: 'destructive',
      });
      return;
    }

    if (nairaEquivalent >= kycRequiredThreshold && !profile?.is_kyc_verified) {
      toast({
        title: 'KYC Verification Required',
        description: `Orders of ₦${kycRequiredThreshold.toLocaleString('en-NG')} or more require identity verification.`,
        variant: 'destructive',
      });
      navigate('/kyc');
      return;
    }

    setIsSending(true);
    try {
      // 1. Get VASP Quote
      const quote = await vaspService.quoteBuy(selectedCrypto, usdValue);
      
      // 2. Execute VASP Order
      const tx = await vaspService.executeBuy(quote.id);
      
      // 3. Update internal double-entry ledger via RPC
      const { error } = await supabase.rpc('admin_confirm_trade', {
        p_user_id: user?.id,
        p_type: 'buy',
        p_fiat_amount: nairaEquivalent,
        p_crypto_amount: cryptoAmount,
        p_crypto_symbol: selectedCrypto
      });

      if (error) throw error;

      toast({
        title: 'Trade Executed',
        description: `Successfully purchased ${cryptoAmount.toFixed(6)} ${selectedCrypto} via VASP routing.`,
      });
      
      setUsdAmount('');
      // Navigate to dashboard to see updated balance
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err) {
      console.error('Failed to execute VASP trade:', err);
      toast({
        title: 'Trade Failed',
        description: 'Could not complete the transaction with the liquidity provider.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-2xl mx-auto p-4 pb-28 space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="p-2 text-gray-600 dark:text-gray-300">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Buy Cryptocurrency</h1>
        </div>

        {/* OTC Instruction Card */}
        <Card className="rounded-2xl shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white text-center space-y-2">
            <ShieldCheck className="w-10 h-10 mx-auto" />
            <h2 className="text-2xl font-bold">VASP Liquidity Network</h2>
            <p className="text-sm opacity-90">Automated compliant routing via licensed third-party exchanges.</p>
          </div>

          <CardContent className="space-y-6 pt-6">
            {/* Quick Estimator */}
            <div className="bg-gray-50 dark:bg-gray-700/50 p-5 rounded-2xl border border-gray-200 dark:border-gray-600 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center justify-between">
                <span>OTC Calculator (Est.)</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={fetchPrices}
                  disabled={fetching}
                  className="h-8 w-8 p-0 text-gray-600 dark:text-gray-300"
                >
                  <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
                </Button>
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600 dark:text-gray-400">Select Asset</Label>
                  <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
                    <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                      {cryptoOptions.map((crypto) => {
                        const price = getCurrentPrice(crypto.symbol);
                        return (
                          <SelectItem key={crypto.symbol} value={crypto.symbol} className="text-gray-900 dark:text-white">
                            <span className={`${crypto.color} font-bold mr-2`}>{crypto.icon}</span>
                            <span>{crypto.name} ({crypto.symbol})</span>
                            <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                              ${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600 dark:text-gray-400">Amount (USD)</Label>
                  <Input
                    type="number"
                    placeholder="Enter $ amount"
                    value={usdAmount}
                    onChange={(e) => setUsdAmount(e.target.value)}
                    className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {usdAmount && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <div className="flex justify-between">
                    <span>Current Rate:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      ₦{exchangeRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / USD
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>You will send (NGN):</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      ₦{nairaEquivalent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. Crypto to Receive:</span>
                    <span className="font-bold text-amber-500">
                      {cryptoAmount.toFixed(6)} {selectedCrypto}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Compliant Trade Process:</h3>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Request Quote</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Our system fetches a live execution price from our partner VASP.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Execute via API</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400">The trade is settled instantly on external liquidity rails.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Ledger Settlement</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Your digital wallet is credited automatically.</p>
                </div>
              </div>
            </div>

            {/* Call to action */}
            <Button 
              onClick={handleExecuteTrade}
              disabled={isSending}
              className="w-full bg-blue-600 hover:bg-blue-700 py-4 h-14 rounded-xl text-lg font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-70"
            >
              {isSending ? (
                <><Loader2 className="w-5 h-5 animate-spin" /><span>Processing Trade...</span></>
              ) : (
                <><Zap className="w-5 h-5" /><span>Request Quote & Execute</span></>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Security badge */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center space-x-3">
          <ShieldCheck className="w-8 h-8 text-blue-500 shrink-0" />
          <div>
            <h4 className="text-xs font-semibold text-gray-900 dark:text-white">Regulatory Separation</h4>
            <p className="text-[11px] text-gray-600 dark:text-gray-400">Fiat custody is handled by our MFB partner. Digital assets are processed by licensed VASP partners.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuyCrypto;

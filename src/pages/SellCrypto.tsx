import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/contexts/WalletContext';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cryptoService, CryptoPrice } from '@/services/cryptoService';
import SellCryptoForm from '@/components/sell-crypto/SellCryptoForm';
import SaleInstructions from '@/components/sell-crypto/SaleInstructions';
import { useChat } from '@/hooks/useChat';
import { useAuth } from '@/contexts/AuthContext';
import { useTransactionLimits } from '@/hooks/useTransactionLimits';

const SellCrypto = () => {
  const [selectedCrypto, setSelectedCrypto] = useState('');
  const [usdAmount, setUsdAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPrice[]>([]);
  const [exchangeRate, setExchangeRate] = useState(1650);
  const { addTransaction } = useWallet();
  const { toast } = useToast();
  const { sendMessage } = useChat();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { maxTransactionAmount, kycRequiredThreshold } = useTransactionLimits();

  const cryptoOptions = [
    { 
      symbol: 'BTC', 
      name: 'Bitcoin', 
      icon: '₿',
      network: 'Bitcoin'
    },
    { 
      symbol: 'ETH', 
      name: 'Ethereum', 
      icon: 'Ξ',
      network: 'Ethereum'
    },
    { 
      symbol: 'USDT', 
      name: 'Tether', 
      icon: '₮',
      network: 'Ethereum (ERC-20)'
    }
  ];

  const formatCurrency = (amount: number, currency: string = 'USD', showDecimals: boolean = true) => {
    const options: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    };
    
    if (currency === 'NGN') {
      return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: showDecimals ? 2 : 0, maximumFractionDigits: showDecimals ? 2 : 0 })}`;
    } else {
      return `$${amount.toLocaleString('en-US', { minimumFractionDigits: showDecimals ? 2 : 0, maximumFractionDigits: showDecimals ? 2 : 0 })}`;
    }
  };

  // Fetch real-time crypto prices
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const symbols = ['bitcoin', 'ethereum', 'tether'];
        const { prices, sellRate } = await cryptoService.getCombinedPrices();
        
        // Map the prices to match our crypto options
        const mappedPrices = prices.map(price => {
          if (price.symbol === 'BTC') return { ...price, symbol: 'BTC' };
          if (price.symbol === 'ETH') return { ...price, symbol: 'ETH' };
          return price;
        });
        
        // Add USDT with price of 1
        mappedPrices.push({
          symbol: 'USDT',
          price: 1,
          change24h: 0,
          volume24h: 0
        });
        
        setCryptoPrices(mappedPrices);
        setExchangeRate(sellRate);
      } catch (error) {
        console.error('Error fetching prices:', error);
        // Fallback prices
        setCryptoPrices([
          { symbol: 'BTC', price: 65000, change24h: 2.5, volume24h: 20000000000 },
          { symbol: 'ETH', price: 2500, change24h: 1.8, volume24h: 12000000000 },
          { symbol: 'USDT', price: 1, change24h: 0, volume24h: 5000000000 }
        ]);
      }
    };

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
  const calculatedCryptoAmount = selectedCryptoData && currentPrice ? (usdValue / currentPrice) : 0;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Address copied to clipboard",
    });
  };

  const handleSell = async () => {
    if (!selectedCrypto || !usdAmount || parseFloat(usdAmount) <= 0) {
      toast({
        title: "Error",
        description: "Please select a cryptocurrency and enter a valid amount.",
        variant: "destructive",
      });
      return;
    }

    const nairaEquivalentCheck = usdValue * exchangeRate;

    // Enforce maximum transaction amount
    if (nairaEquivalentCheck > maxTransactionAmount) {
      toast({
        title: "Amount Exceeds Limit",
        description: `The maximum per transaction is ₦${maxTransactionAmount.toLocaleString('en-NG')}. Your order is ₦${nairaEquivalentCheck.toLocaleString('en-NG', { maximumFractionDigits: 0 })}.`,
        variant: "destructive",
      });
      return;
    }

    // Enforce KYC threshold
    if (nairaEquivalentCheck >= kycRequiredThreshold && !profile?.is_kyc_verified) {
      toast({
        title: "KYC Verification Required",
        description: `Orders of ₦${kycRequiredThreshold.toLocaleString('en-NG')} or more require identity verification.`,
        variant: "destructive",
      });
      navigate('/kyc');
      return;
    }

    setIsLoading(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const nairaEquivalent = usdValue * exchangeRate;

      const transaction = {
        type: 'sell' as const,
        asset: selectedCrypto,
        amount: calculatedCryptoAmount,
        fiat_amount: nairaEquivalent,
        fiat_currency: 'NGN',
        status: 'pending' as const,
        description: `Sold ${calculatedCryptoAmount.toFixed(6)} ${selectedCrypto} - pending confirmation`
      };

      addTransaction(transaction);

      // Send chat message to admin
      const message = `🚨 NEW CRYPTO SALE\nAsset: ${calculatedCryptoAmount.toFixed(6)} ${selectedCrypto}\nExpected Fiat: ${formatCurrency(nairaEquivalent, 'NGN')}\nStatus: Waiting for Admin Wallet Address`;
      await sendMessage(message);

      toast({
        title: "Order Created",
        description: "Redirecting to chat to receive wallet address...",
      });
      
      // Redirect to chat
      navigate('/chat');
    } catch (error) {
      toast({
        title: "Transaction Failed",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="p-4 pb-24 space-y-6">
          {/* Header */}
          <div className="flex items-center space-x-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="p-2 text-gray-600 dark:text-gray-300">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Sell Cryptocurrency</h1>
          </div>

          <SellCryptoForm
            selectedCrypto={selectedCrypto}
            setSelectedCrypto={setSelectedCrypto}
            usdAmount={usdAmount}
            setUsdAmount={setUsdAmount}
            isLoading={isLoading}
            cryptoOptions={cryptoOptions}
            getCurrentPrice={getCurrentPrice}
            formatCurrency={formatCurrency}
            selectedCryptoData={selectedCryptoData}
            currentPrice={currentPrice}
            usdValue={usdValue}
            calculatedCryptoAmount={calculatedCryptoAmount}
            exchangeRate={exchangeRate}
            onSell={handleSell}
          />

          <SaleInstructions />
        </div>
      </div>
  );
};

export default SellCrypto;

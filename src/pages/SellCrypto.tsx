
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/contexts/WalletContext';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/Layout';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cryptoService, CryptoPrice } from '@/services/cryptoService';
import SellCryptoForm from '@/components/sell-crypto/SellCryptoForm';
import SaleInstructions from '@/components/sell-crypto/SaleInstructions';

const SellCrypto = () => {
  const [selectedCrypto, setSelectedCrypto] = useState('');
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPrice[]>([]);
  const [exchangeRate, setExchangeRate] = useState(1650);
  const { addTransaction } = useWallet();
  const { toast } = useToast();

  const cryptoOptions = [
    { 
      symbol: 'BTC', 
      name: 'Bitcoin', 
      icon: '₿',
      address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      network: 'Bitcoin'
    },
    { 
      symbol: 'ETH', 
      name: 'Ethereum', 
      icon: 'Ξ',
      address: '0x742d35Cc6635C0532925a3b8D3Ac7A194f2a0C57',
      network: 'Ethereum'
    },
    { 
      symbol: 'USDT', 
      name: 'Tether', 
      icon: '₮',
      address: '0x742d35Cc6635C0532925a3b8D3Ac7A194f2a0C57',
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
        const { prices, exchangeRate: currentRate } = await cryptoService.getCombinedPrices();
        
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
        setExchangeRate(currentRate);
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
  const usdValue = selectedCryptoData && cryptoAmount ? 
    (parseFloat(cryptoAmount) * currentPrice) : 0;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Address copied to clipboard",
    });
  };

  const handleSell = async () => {
    if (!selectedCrypto || !cryptoAmount || parseFloat(cryptoAmount) <= 0) {
      toast({
        title: "Error",
        description: "Please select a cryptocurrency and enter a valid amount.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const nairaEquivalent = usdValue * exchangeRate;

      const transaction = {
        type: 'sell' as const,
        asset: selectedCrypto,
        amount: parseFloat(cryptoAmount),
        fiat_amount: nairaEquivalent,
        fiat_currency: 'NGN',
        status: 'pending' as const,
        description: `Sold ${cryptoAmount} ${selectedCrypto} - pending confirmation`
      };

      addTransaction(transaction);

      toast({
        title: "Sell Order Created!",
        description: `Send ${cryptoAmount} ${selectedCrypto} to the provided address. You'll receive ${formatCurrency(nairaEquivalent, 'NGN')} after confirmation.`,
      });
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
    <Layout>
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
            cryptoAmount={cryptoAmount}
            setCryptoAmount={setCryptoAmount}
            isLoading={isLoading}
            cryptoOptions={cryptoOptions}
            getCurrentPrice={getCurrentPrice}
            formatCurrency={formatCurrency}
            selectedCryptoData={selectedCryptoData}
            currentPrice={currentPrice}
            usdValue={usdValue}
            exchangeRate={exchangeRate}
            onCopyAddress={copyToClipboard}
            onSell={handleSell}
          />

          <SaleInstructions />
        </div>
      </div>
    </Layout>
  );
};

export default SellCrypto;

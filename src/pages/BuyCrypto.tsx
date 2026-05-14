
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWallet } from '@/contexts/WalletContext';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/Layout';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cryptoService, CryptoPrice } from '@/services/cryptoService';

const BuyCrypto = () => {
  const [selectedCrypto, setSelectedCrypto] = useState('');
  const [nairaAmount, setNairaAmount] = useState('');
  const [cryptoAddress, setCryptoAddress] = useState('');
  const [selectedChain, setSelectedChain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPrice[]>([]);
  const [exchangeRate, setExchangeRate] = useState(1650);
  const { fiatBalance, addTransaction } = useWallet();
  const { toast } = useToast();

  const cryptoOptions = [
    { 
      symbol: 'BTC', 
      name: 'Bitcoin', 
      icon: '₿',
      chains: ['Bitcoin', 'Lightning Network']
    },
    { 
      symbol: 'ETH', 
      name: 'Ethereum', 
      icon: 'Ξ',
      chains: ['Ethereum', 'Polygon', 'BSC']
    },
    { 
      symbol: 'USDT', 
      name: 'Tether', 
      icon: '₮',
      chains: ['Ethereum (ERC-20)', 'Polygon', 'BSC (BEP-20)', 'Tron (TRC-20)']
    }
  ];

  // Fetch real-time crypto prices - sync with homepage
  useEffect(() => {
    const fetchPrices = async () => {
      try {
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
    const interval = setInterval(fetchPrices, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getCurrentPrice = (symbol: string) => {
    const crypto = cryptoPrices.find(c => c.symbol === symbol);
    return crypto?.price || 0;
  };

  const selectedCryptoData = cryptoOptions.find(crypto => crypto.symbol === selectedCrypto);
  const currentPrice = getCurrentPrice(selectedCrypto);
  const usdValue = nairaAmount ? (parseFloat(nairaAmount) / exchangeRate) : 0;
  const cryptoAmount = selectedCryptoData && currentPrice ? (usdValue / currentPrice) : 0;

  const handleBuy = async () => {
    if (!selectedCrypto || !nairaAmount || !cryptoAddress || !selectedChain) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const purchaseAmount = parseFloat(nairaAmount);
    if (purchaseAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount.",
        variant: "destructive",
      });
      return;
    }

    if (purchaseAmount > fiatBalance) {
      toast({
        title: "Error",
        description: "Insufficient balance.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Simulate transaction processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      const transaction = {
        type: 'buy' as const,
        asset: selectedCrypto,
        amount: cryptoAmount,
        fiat_amount: purchaseAmount,
        fiat_currency: 'NGN',
        status: 'pending' as const,
        description: `Buy ${cryptoAmount.toFixed(6)} ${selectedCrypto} - will be sent to ${cryptoAddress.slice(0, 10)}...`
      };

      addTransaction(transaction);

      toast({
        title: "Purchase Successful!",
        description: `You bought ${cryptoAmount.toFixed(6)} ${selectedCrypto} for ₦${purchaseAmount.toLocaleString()}. It will be sent to your address shortly.`,
      });

      // Clear form
      setSelectedCrypto('');
      setNairaAmount('');
      setCryptoAddress('');
      setSelectedChain('');
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
    <Layout fullWidth={true}>
      <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 flex flex-col relative overflow-hidden">
        <div className="flex-1 w-full max-w-2xl mx-auto p-4 pb-24 space-y-6">
          {/* Header */}
          <div className="flex items-center space-x-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="p-2 text-gray-600 dark:text-gray-300">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Buy Cryptocurrency</h1>
          </div>

          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Purchase Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-900 dark:text-white">Select Cryptocurrency</Label>
                <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
                  <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
                    <SelectValue placeholder="Choose a cryptocurrency" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    {cryptoOptions.map((crypto) => {
                      const price = getCurrentPrice(crypto.symbol);
                      return (
                        <SelectItem key={crypto.symbol} value={crypto.symbol} className="text-gray-900 dark:text-white">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center space-x-2">
                              <span>{crypto.icon}</span>
                              <span>{crypto.name} ({crypto.symbol})</span>
                            </div>
                            <div className="text-right ml-4">
                              <div className="font-semibold text-gray-500 dark:text-gray-400">${price.toLocaleString()}</div>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900 dark:text-white">Amount (Naira)</Label>
                <Input
                  type="number"
                  placeholder="Enter amount in ₦"
                  value={nairaAmount}
                  onChange={(e) => setNairaAmount(e.target.value)}
                  min="0"
                  max={fiatBalance}
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
                />
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Available balance: ₦{fiatBalance.toLocaleString()}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900 dark:text-white">Your Crypto Address</Label>
                <Input
                  placeholder="Enter your crypto wallet address"
                  value={cryptoAddress}
                  onChange={(e) => setCryptoAddress(e.target.value)}
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
                />
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Make sure this is the correct address for the selected cryptocurrency
                </div>
              </div>

              {selectedCryptoData && (
                <div className="space-y-2">
                  <Label className="text-gray-900 dark:text-white">Select Chain/Network</Label>
                  <Select value={selectedChain} onValueChange={setSelectedChain}>
                    <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
                      <SelectValue placeholder="Choose network" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                      {selectedCryptoData.chains.map((chain) => (
                        <SelectItem key={chain} value={chain} className="text-gray-900 dark:text-white">
                          {chain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedCryptoData && nairaAmount && (
                <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg space-y-2 border border-green-200 dark:border-green-800">
                  <h3 className="font-semibold text-green-900 dark:text-green-100">Summary</h3>
                  <div className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-300">You pay:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">₦{parseFloat(nairaAmount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-300">USD equivalent:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">${usdValue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-300">You receive:</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {cryptoAmount.toFixed(6)} {selectedCrypto}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>Current rate:</span>
                    <span>${currentPrice.toFixed(2)} per {selectedCrypto}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>Processing fee:</span>
                    <span>1%</span>
                  </div>
                </div>
              )}

              <Button 
                onClick={handleBuy}
                disabled={!selectedCrypto || !nairaAmount || !cryptoAddress || !selectedChain || isLoading}
                className="w-full bg-fintech-orange hover:bg-fintech-orange/90 py-3"
              >
                {isLoading ? 'Processing...' : `Buy ${selectedCrypto || 'Crypto'}`}
              </Button>

              {selectedCryptoData && cryptoAddress && selectedChain && (
                <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
                  <p>⚠️ Make sure your address supports {selectedCrypto} on {selectedChain} network.</p>
                  <p>Sending to wrong address or network will result in permanent loss.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">How it works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-fintech-orange text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">Select & Calculate</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Choose your crypto and enter the amount you want to buy</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-fintech-orange text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">Provide Address</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Enter your crypto wallet address and select the correct network</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-fintech-orange text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">Receive Crypto</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Your crypto will be sent to your address within 10-30 minutes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default BuyCrypto;

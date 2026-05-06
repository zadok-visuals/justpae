
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/Layout';
import { ArrowLeft, Copy, QrCode } from 'lucide-react';
import { cryptoDepositService, SupportedCrypto, CryptoWalletAddress } from '@/services/cryptoDepositService';

const CryptoDeposit = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [supportedCryptos, setSupportedCryptos] = useState<SupportedCrypto[]>([]);
  const [selectedCrypto, setSelectedCrypto] = useState<string>('');
  const [walletAddress, setWalletAddress] = useState<CryptoWalletAddress | null>(null);
  const [fiatCurrency, setFiatCurrency] = useState<string>('NGN');
  const [expectedAmount, setExpectedAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generatingAddress, setGeneratingAddress] = useState(false);

  useEffect(() => {
    loadSupportedCryptos();
  }, []);

  useEffect(() => {
    if (selectedCrypto) {
      loadWalletAddress();
    }
  }, [selectedCrypto]);

  const loadSupportedCryptos = async () => {
    try {
      const cryptos = await cryptoDepositService.getSupportedCryptos();
      setSupportedCryptos(cryptos);
    } catch (error) {
      console.error('Error loading supported cryptos:', error);
      toast({
        title: "Error",
        description: "Failed to load supported cryptocurrencies",
        variant: "destructive"
      });
    }
  };

  const loadWalletAddress = async () => {
    try {
      setGeneratingAddress(true);
      let address = await cryptoDepositService.getUserWalletAddress(selectedCrypto);
      
      if (!address) {
        // Generate new address if none exists
        address = await cryptoDepositService.generateWalletAddress(selectedCrypto);
        toast({
          title: "Wallet Address Generated",
          description: "A new deposit address has been created for you",
        });
      }
      
      setWalletAddress(address);
    } catch (error) {
      console.error('Error loading wallet address:', error);
      toast({
        title: "Error",
        description: "Failed to load or generate wallet address",
        variant: "destructive"
      });
    } finally {
      setGeneratingAddress(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Address copied to clipboard",
    });
  };

  const handleCreateDeposit = async () => {
    if (!selectedCrypto || !walletAddress || !expectedAmount) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      await cryptoDepositService.createCryptoDeposit(
        selectedCrypto,
        walletAddress.id,
        parseFloat(expectedAmount),
        fiatCurrency
      );

      toast({
        title: "Deposit Initiated",
        description: "Your crypto deposit has been set up. Send your crypto to the provided address.",
      });

      navigate('/wallet');
    } catch (error) {
      console.error('Error creating deposit:', error);
      toast({
        title: "Error",
        description: "Failed to create deposit",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedCryptoInfo = supportedCryptos.find(c => c.id === selectedCrypto);

  return (
    <Layout>
      <div className="p-4 pb-24 space-y-6 bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate(-1)}
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Crypto Deposit</h1>
            <p className="text-gray-600">Deposit crypto and receive fiat in your wallet</p>
          </div>
        </div>

        {/* Crypto Selection */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Select Cryptocurrency</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="crypto-select">Choose Crypto to Deposit</Label>
              <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
                <SelectTrigger className="w-full mt-2">
                  <SelectValue placeholder="Select a cryptocurrency" />
                </SelectTrigger>
                <SelectContent>
                  {supportedCryptos.map((crypto) => (
                    <SelectItem key={crypto.id} value={crypto.id}>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{crypto.symbol}</span>
                        <span className="text-gray-500">- {crypto.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="fiat-currency">Receive Currency</Label>
              <Select value={fiatCurrency} onValueChange={setFiatCurrency}>
                <SelectTrigger className="w-full mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NGN">Nigerian Naira (NGN)</SelectItem>
                  <SelectItem value="USD">US Dollar (USD)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="expected-amount">Expected Crypto Amount</Label>
              <Input
                id="expected-amount"
                type="number"
                placeholder="0.00"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
                className="mt-2"
              />
              {selectedCryptoInfo && (
                <p className="text-sm text-gray-500 mt-1">
                  Amount of {selectedCryptoInfo.symbol} you plan to send
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Wallet Address */}
        {selectedCrypto && (
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Deposit Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {generatingAddress ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fintech-blue mx-auto mb-4"></div>
                  <p className="text-gray-600">Generating deposit address...</p>
                </div>
              ) : walletAddress ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        {selectedCryptoInfo?.symbol} Address
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(walletAddress.address)}
                        className="p-1"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="font-mono text-sm bg-white p-3 rounded border break-all">
                      {walletAddress.address}
                    </p>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="font-semibold text-blue-800 mb-2">Important Instructions:</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• Only send {selectedCryptoInfo?.symbol} to this address</li>
                      <li>• Minimum deposit: 0.001 {selectedCryptoInfo?.symbol}</li>
                      <li>• Transactions require 6 confirmations</li>
                      <li>• Funds will be credited as {fiatCurrency} after confirmation</li>
                    </ul>
                  </div>

                  <Button
                    onClick={handleCreateDeposit}
                    disabled={loading || !expectedAmount}
                    className="w-full bg-fintech-blue hover:bg-fintech-blue/90"
                  >
                    {loading ? 'Setting up...' : 'Confirm Deposit Setup'}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Select a cryptocurrency to generate deposit address
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default CryptoDeposit;

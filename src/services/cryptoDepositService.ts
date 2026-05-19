
import { supabase } from '@/integrations/supabase/client';

export interface SupportedCrypto {
  id: string;
  symbol: string;
  name: string;
  network: string;
  contract_address?: string;
  decimals: number;
  is_active: boolean;
}

export interface CryptoWalletAddress {
  id: string;
  user_id: string;
  crypto_id: string;
  address: string;
  is_active: boolean;
  crypto?: SupportedCrypto;
}

export type CryptoDepositStatus = 'pending' | 'confirming' | 'confirmed' | 'failed' | 'cancelled';

export interface CryptoDeposit {
  id: string;
  user_id: string;
  crypto_id: string;
  wallet_address_id: string;
  transaction_hash?: string;
  from_address?: string;
  crypto_amount: number;
  fiat_currency: string;
  fiat_amount: number;
  exchange_rate: number;
  fee_amount: number;
  net_fiat_amount: number;
  status: CryptoDepositStatus;
  confirmations: number;
  required_confirmations: number;
  blockchain_status?: string;
  metadata: any;
  created_at: string;
  updated_at: string;
}

class CryptoDepositService {
  async getSupportedCryptos(): Promise<SupportedCrypto[]> {
    try {
      const { data, error } = await supabase
        .from('supported_cryptos')
        .select('*')
        .eq('is_active', true)
        .order('symbol');

      if (error) {
        console.error('Error fetching supported cryptos:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getSupportedCryptos:', error);
      throw error;
    }
  }

  async getUserWalletAddress(cryptoId: string): Promise<CryptoWalletAddress | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('crypto_wallet_addresses')
        .select(`
          *,
          crypto:supported_cryptos(*)
        `)
        .eq('user_id', user.id)
        .eq('crypto_id', cryptoId)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching wallet address:', error);
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('Error in getUserWalletAddress:', error);
      throw error;
    }
  }

  async generateWalletAddress(cryptoId: string): Promise<CryptoWalletAddress> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Generate a unique wallet address (in production, this would use proper crypto libraries)
      const address = this.generateUniqueAddress(cryptoId);

      const { data, error } = await supabase
        .from('crypto_wallet_addresses')
        .insert({
          user_id: user.id,
          crypto_id: cryptoId,
          address: address,
          is_active: true
        })
        .select(`
          *,
          crypto:supported_cryptos(*)
        `)
        .single();

      if (error) {
        console.error('Error creating wallet address:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in generateWalletAddress:', error);
      throw error;
    }
  }

  async createCryptoDeposit(
    cryptoId: string,
    walletAddressId: string,
    cryptoAmount: number,
    fiatCurrency: string = 'NGN'
  ): Promise<CryptoDeposit> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get current crypto price and calculate fiat amount
      const exchangeRate = await this.getExchangeRate(cryptoId, fiatCurrency);
      const fiatAmount = cryptoAmount * exchangeRate;
      const feeAmount = fiatAmount * 0.01; // 1% fee
      const netFiatAmount = fiatAmount - feeAmount;

      const { data, error } = await supabase
        .from('crypto_deposits')
        .insert({
          user_id: user.id,
          crypto_id: cryptoId,
          wallet_address_id: walletAddressId,
          crypto_amount: cryptoAmount,
          fiat_currency: fiatCurrency,
          fiat_amount: fiatAmount,
          exchange_rate: exchangeRate,
          fee_amount: feeAmount,
          net_fiat_amount: netFiatAmount,
          status: 'pending' as CryptoDepositStatus
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating crypto deposit:', error);
        throw error;
      }

      // Cast the status to the proper type since we know it's valid
      return {
        ...data,
        status: data.status as CryptoDepositStatus
      };
    } catch (error) {
      console.error('Error in createCryptoDeposit:', error);
      throw error;
    }
  }

  async getUserDeposits(): Promise<CryptoDeposit[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('crypto_deposits')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user deposits:', error);
        throw error;
      }

      // Cast the status to the proper type for each deposit
      return (data || []).map(deposit => ({
        ...deposit,
        status: deposit.status as CryptoDepositStatus
      }));
    } catch (error) {
      console.error('Error in getUserDeposits:', error);
      throw error;
    }
  }

  private generateUniqueAddress(cryptoId: string): string {
    // This is a mock implementation. In production, you would use proper crypto libraries
    // to generate real wallet addresses based on the crypto type
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 15);
    
    // Different address formats for different cryptos
    if (cryptoId.includes('BTC') || cryptoId.includes('bitcoin')) {
      return `bc1q${random}${timestamp.substring(-8)}`;
    } else if (cryptoId.includes('ETH') || cryptoId.includes('ethereum')) {
      return `0x${random}${timestamp}`.substring(0, 42);
    } else {
      return `${random}${timestamp}`;
    }
  }

  private async getExchangeRate(cryptoId: string, fiatCurrency: string): Promise<number> {
    try {
      // Get crypto info
      const { data: crypto } = await supabase
        .from('supported_cryptos')
        .select('symbol')
        .eq('id', cryptoId)
        .single();

      if (!crypto) throw new Error('Crypto not found');

      // Get current market price (simplified - in production use real API)
      const mockRates: Record<string, number> = {
        'BTC': 43000,
        'ETH': 2600,
        'USDT': 1,
        'USDC': 1
      };

      const usdRate = mockRates[crypto.symbol] || 1;
      
      // Convert to target fiat currency
      if (fiatCurrency === 'NGN') {
        let ngnRate = 1650;
        try {
          const { data: settingData, error: settingError } = await supabase
            .from('system_settings')
            .select('setting_value')
            .eq('setting_key', 'usd_to_ngn_rate')
            .single();
            
          if (!settingError && settingData?.setting_value) {
            const rate = parseFloat(settingData.setting_value);
            if (!isNaN(rate)) {
              ngnRate = rate;
            }
          }
        } catch (err) {
          console.warn('Failed to fetch usd_to_ngn_rate for deposit, using fallback:', err);
        }
        return usdRate * ngnRate;
      }
      
      return usdRate;
    } catch (error) {
      console.error('Error getting exchange rate:', error);
      return 1; // Fallback rate
    }
  }
}

export const cryptoDepositService = new CryptoDepositService();

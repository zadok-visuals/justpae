
import { supabase } from '@/integrations/supabase/client';

interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap?: number;
}

interface CoinGeckoResponse {
  [key: string]: {
    usd: number;
    usd_24h_change: number;
    usd_24h_vol: number;
    usd_market_cap: number;
  };
}

interface ExchangeRateResponse {
  rates: {
    NGN: number;
  };
}

class CryptoService {
  private coinGeckoBaseUrl = 'https://api.coingecko.com/api/v3';
  private exchangeRateUrl = 'https://api.exchangerate-api.com/v4/latest/USD';

  async getExchangeRate(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'usd_to_ngn_rate')
        .single();
        
      if (!error && data?.setting_value) {
        const rate = parseFloat(data.setting_value);
        if (!isNaN(rate)) {
          return rate;
        }
      }
    } catch (dbError) {
      console.warn('Error reading usd_to_ngn_rate from DB, falling back to API:', dbError);
    }

    try {
      const response = await fetch(this.exchangeRateUrl);
      const data: ExchangeRateResponse = await response.json();
      return data.rates.NGN || 1650; // Fallback to 1650 if API fails
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      return 1650; // Fallback rate
    }
  }

  async getCryptoPrices(symbols: string[] = ['bitcoin', 'ethereum', 'cardano']): Promise<CryptoPrice[]> {
    try {
      const symbolsParam = symbols.join(',');
      const response = await fetch(
        `${this.coinGeckoBaseUrl}/simple/price?ids=${symbolsParam}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: CoinGeckoResponse = await response.json();
      
      const symbolMap: Record<string, string> = {
        'bitcoin': 'BTC',
        'ethereum': 'ETH',
        'cardano': 'ADA'
      };
      
      return symbols.map(id => {
        const coinData = data[id];
        if (!coinData) {
          console.warn(`No data found for ${id}`);
          return {
            symbol: symbolMap[id] || id.toUpperCase(),
            price: 0,
            change24h: 0,
            volume24h: 0,
            marketCap: 0
          };
        }
        
        return {
          symbol: symbolMap[id] || id.toUpperCase(),
          price: coinData.usd,
          change24h: coinData.usd_24h_change || 0,
          volume24h: coinData.usd_24h_vol || 0,
          marketCap: coinData.usd_market_cap || 0
        };
      });
    } catch (error) {
      console.warn('Error fetching crypto prices from CoinGecko, trying CoinCap fallback:', error);
      try {
        return await this.fetchFromCoinCap(symbols);
      } catch (fallbackError) {
        console.error('Error fetching from CoinCap fallback:', fallbackError);
        // Return fallback data if all APIs fail
        return [
          { symbol: 'BTC', price: 65000, change24h: 2.5, volume24h: 20000000000, marketCap: 840000000000 },
          { symbol: 'ETH', price: 2500, change24h: 1.8, volume24h: 12000000000, marketCap: 310000000000 },
          { symbol: 'ADA', price: 0.38, change24h: -0.5, volume24h: 350000000, marketCap: 13000000000 }
        ];
      }
    }
  }

  private async fetchFromCoinCap(symbols: string[]): Promise<CryptoPrice[]> {
    const symbolsParam = symbols.join(',');
    const response = await fetch(`https://api.coincap.io/v2/assets?ids=${symbolsParam}`);
    
    if (!response.ok) {
      throw new Error(`CoinCap HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const symbolMap: Record<string, string> = {
      'bitcoin': 'BTC',
      'ethereum': 'ETH',
      'cardano': 'ADA'
    };
    
    return symbols.map(id => {
      const coin = data.data?.find((c: any) => c.id === id);
      if (!coin) {
        return {
          symbol: symbolMap[id] || id.toUpperCase(),
          price: 0,
          change24h: 0,
          volume24h: 0,
          marketCap: 0
        };
      }
      return {
        symbol: coin.symbol,
        price: parseFloat(coin.priceUsd) || 0,
        change24h: parseFloat(coin.changePercent24Hr) || 0,
        volume24h: parseFloat(coin.volumeUsd24Hr) || 0,
        marketCap: parseFloat(coin.marketCapUsd) || 0
      };
    });
  }

  async getCombinedPrices(): Promise<{ prices: CryptoPrice[]; exchangeRate: number }> {
    try {
      const [prices, exchangeRate] = await Promise.all([
        this.getCryptoPrices(),
        this.getExchangeRate()
      ]);

      console.log(`Current USD to NGN rate: ${exchangeRate}`);
      
      return { prices, exchangeRate };
    } catch (error) {
      console.error('Error getting combined data:', error);
      return { 
        prices: [
          { symbol: 'BTC', price: 43000, change24h: 2.5, volume24h: 20000000000, marketCap: 840000000000 },
          { symbol: 'ETH', price: 2600, change24h: 1.8, volume24h: 12000000000, marketCap: 310000000000 },
          { symbol: 'ADA', price: 0.38, change24h: -0.5, volume24h: 350000000, marketCap: 13000000000 }
        ], 
        exchangeRate: 1650 
      };
    }
  }
}

export const cryptoService = new CryptoService();
export type { CryptoPrice };

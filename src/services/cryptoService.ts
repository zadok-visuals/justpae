
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
      console.error('Error fetching crypto prices:', error);
      // Return fallback data if API fails
      return [
        { symbol: 'BTC', price: 43000, change24h: 2.5, volume24h: 20000000000, marketCap: 840000000000 },
        { symbol: 'ETH', price: 2600, change24h: 1.8, volume24h: 12000000000, marketCap: 310000000000 },
        { symbol: 'ADA', price: 0.38, change24h: -0.5, volume24h: 350000000, marketCap: 13000000000 }
      ];
    }
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

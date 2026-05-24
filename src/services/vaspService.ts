/**
 * Virtual Asset Service Provider (VASP) Integration Service
 * 
 * This service abstracts the connection to a licensed third-party crypto liquidity provider
 * (e.g., Quidax, Yellow Card). By routing all crypto transactions through a VASP, our
 * partner MFB is shielded from direct crypto custody and exchange risk, fulfilling
 * Nigerian regulatory compliance requirements.
 */

export interface VASPQuote {
  id: string;
  cryptoSymbol: string;
  fiatAmount: number;
  cryptoAmount: number;
  exchangeRate: number;
  expiresAt: Date;
}

export interface VASPTransaction {
  id: string;
  type: 'buy' | 'sell';
  cryptoSymbol: string;
  fiatAmount: number;
  cryptoAmount: number;
  status: 'pending' | 'completed' | 'failed';
  timestamp: Date;
}

class VASPService {
  private mockDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  /**
   * Fetches a live quote from the VASP for buying crypto with fiat.
   */
  async quoteBuy(cryptoSymbol: string, fiatAmount: number): Promise<VASPQuote> {
    await this.mockDelay(800);
    
    // Simulate current market rate (e.g., 1 BTC = $65,000, $1 = ₦1650 -> 1 BTC = ₦107,250,000)
    // In production, this hits the VASP API (e.g. GET /api/v1/quotes/buy)
    const mockRate = cryptoSymbol === 'BTC' ? 107250000 : (cryptoSymbol === 'ETH' ? 5500000 : 1650);
    const cryptoAmount = fiatAmount / mockRate;
    
    return {
      id: `QUOTE_BUY_${Date.now()}`,
      cryptoSymbol,
      fiatAmount,
      cryptoAmount,
      exchangeRate: mockRate,
      expiresAt: new Date(Date.now() + 60 * 1000) // Valid for 60 seconds
    };
  }

  /**
   * Fetches a live quote from the VASP for selling crypto to fiat.
   */
  async quoteSell(cryptoSymbol: string, cryptoAmount: number): Promise<VASPQuote> {
    await this.mockDelay(800);
    
    const mockRate = cryptoSymbol === 'BTC' ? 106500000 : (cryptoSymbol === 'ETH' ? 5450000 : 1640);
    const fiatAmount = cryptoAmount * mockRate;
    
    return {
      id: `QUOTE_SELL_${Date.now()}`,
      cryptoSymbol,
      fiatAmount,
      cryptoAmount,
      exchangeRate: mockRate,
      expiresAt: new Date(Date.now() + 60 * 1000)
    };
  }

  /**
   * Executes a previously generated buy quote through the VASP.
   */
  async executeBuy(quoteId: string): Promise<VASPTransaction> {
    await this.mockDelay(1500);
    
    // In production: POST /api/v1/orders/execute { quoteId }
    console.log(`[VASP API] Executed Buy Quote: ${quoteId}`);
    
    return {
      id: `VASP_TX_${Date.now()}`,
      type: 'buy',
      cryptoSymbol: 'BTC', // Mocked, ideally comes from quote state
      fiatAmount: 0, 
      cryptoAmount: 0,
      status: 'completed',
      timestamp: new Date()
    };
  }

  /**
   * Executes a previously generated sell quote through the VASP.
   */
  async executeSell(quoteId: string): Promise<VASPTransaction> {
    await this.mockDelay(1500);
    
    console.log(`[VASP API] Executed Sell Quote: ${quoteId}`);
    
    return {
      id: `VASP_TX_${Date.now()}`,
      type: 'sell',
      cryptoSymbol: 'BTC',
      fiatAmount: 0,
      cryptoAmount: 0,
      status: 'completed',
      timestamp: new Date()
    };
  }
}

export const vaspService = new VASPService();

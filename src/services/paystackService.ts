
interface PaystackTransactionData {
  email: string;
  amount: number; // in kobo (multiply naira by 100)
  currency?: string;
  reference?: string;
  callback_url?: string;
  metadata?: {
    user_id: string;
    transaction_type: string;
    [key: string]: any;
  };
}

interface PaystackResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerificationResponse {
  status: boolean;
  message: string;
  data: {
    status: string;
    reference: string;
    amount: number;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata: any;
    customer: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
    };
  };
}

class PaystackService {
  private supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  generateReference(): string {
    return `amazingpay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async initializeTransaction(data: PaystackTransactionData): Promise<PaystackResponse | null> {
    try {
      const reference = data.reference || this.generateReference();
      
      const payload = {
        action: 'initialize',
        email: data.email,
        amount: data.amount,
        currency: data.currency || 'NGN',
        reference,
        callback_url: data.callback_url || `${window.location.origin}/payment-callback`,
        metadata: data.metadata
      };

      console.log('Initializing Paystack transaction:', payload);

      const response = await fetch(`${this.supabaseUrl}/functions/v1/paystack-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to initialize transaction');
      }

      const result = await response.json();
      
      if (!result.status) {
        throw new Error(result.message || 'Transaction initialization failed');
      }

      return result;
    } catch (error) {
      console.error('Error initializing Paystack transaction:', error);
      return null;
    }
  }

  async verifyTransaction(reference: string): Promise<PaystackVerificationResponse | null> {
    try {
      console.log('Verifying Paystack transaction:', reference);
      
      const response = await fetch(`${this.supabaseUrl}/functions/v1/paystack-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          action: 'verify',
          reference
        })
      });

      if (!response.ok) {
        throw new Error('Failed to verify transaction');
      }

      const result = await response.json();
      
      if (!result.status) {
        throw new Error(result.message || 'Transaction verification failed');
      }

      return result;
    } catch (error) {
      console.error('Error verifying Paystack transaction:', error);
      return null;
    }
  }

  redirectToPayment(authorizationUrl: string): void {
    window.open(authorizationUrl, '_blank');
  }
}

export const paystackService = new PaystackService();
export type { PaystackTransactionData, PaystackResponse, PaystackVerificationResponse };

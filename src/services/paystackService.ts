
interface PaystackTransactionData {
  email: string;
  amount: number; // in Naira (backend converts to kobo)
  currency?: string;
  reference?: string;
  callback_url?: string;
  channels?: string[];
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

import { supabase } from '@/integrations/supabase/client';

class PaystackService {
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
        metadata: data.metadata,
        channels: data.channels
      };

      console.log('Initializing Paystack transaction:', payload);

      const { data: result, error } = await supabase.functions.invoke('paystack-payment', {
        body: payload
      });

      console.log('Result from edge function:', result);

      if (error) {
        throw new Error(error.message || 'Failed to initialize transaction');
      }
      
      if (!result?.status) {
        throw new Error(result?.message || 'Transaction initialization failed');
      }

      return result;
    } catch (error) {
      console.error('Error initializing Paystack transaction:', error);
      throw error;
    }
  }

  async verifyTransaction(reference: string): Promise<PaystackVerificationResponse | null> {
    try {
      console.log('Verifying Paystack transaction:', reference);
      
      const { data: result, error } = await supabase.functions.invoke('paystack-payment', {
        body: {
          action: 'verify',
          reference
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to verify transaction');
      }
      
      if (!result.status) {
        throw new Error(result.message || 'Transaction verification failed');
      }

      return result;
    } catch (error) {
      console.error('Error verifying Paystack transaction:', error);
      throw error;
    }
  }

  redirectToPayment(authorizationUrl: string): void {
    window.open(authorizationUrl, '_blank');
  }
}

export const paystackService = new PaystackService();
export type { PaystackTransactionData, PaystackResponse, PaystackVerificationResponse };

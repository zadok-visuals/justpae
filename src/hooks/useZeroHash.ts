import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export const useZeroHash = () => {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const callZeroHash = async (method: 'GET' | 'POST' | 'PUT', endpoint: string, payload?: any) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "You must be logged in to perform this action.",
        variant: "destructive"
      });
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('zero-hash-client', {
        body: {
          method,
          endpoint,
          payload
        }
      });

      if (error) throw error;

      return data;
    } catch (err: any) {
      console.error("Zero Hash API Error:", err);
      toast({
        title: "API Error",
        description: err.message || "Failed to communicate with Zero Hash",
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Register a user as a Zero Hash Participant
   */
  const createParticipant = async (kycData: any) => {
    // Note: The payload structure here must perfectly match the Zero Hash 
    // /participants API schema. Usually involves name, dob, email, address.
    const payload = {
      customer_type: "individual",
      first_name: kycData.firstName,
      last_name: kycData.lastName,
      email: user?.email,
      dob: kycData.dob, // YYYY-MM-DD
      residence_address: {
        street_1: kycData.address,
        city: kycData.city,
        state_province: kycData.state,
        postal_code: kycData.postalCode,
        country: kycData.country || "US"
      }
    };

    return await callZeroHash('POST', '/participants', payload);
  };

  /**
   * Request a unique deposit address for a specific token
   */
  const getDepositAddress = async (participantCode: string, asset: string = 'BTC') => {
    return await callZeroHash('POST', `/deposits/digital_assets/addresses`, {
      participant_code: participantCode,
      asset: asset
    });
  };

  return {
    loading,
    callZeroHash,
    createParticipant,
    getDepositAddress
  };
};

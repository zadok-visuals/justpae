import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TransactionLimits {
  maxTransactionAmount: number;
  kycRequiredThreshold: number;
  isLoaded: boolean;
}

/**
 * Fetches and returns live transaction limits from system_settings.
 * Falls back to safe defaults if the DB is unavailable.
 */
export const useTransactionLimits = (): TransactionLimits => {
  const [limits, setLimits] = useState<TransactionLimits>({
    maxTransactionAmount: 1_000_000,
    kycRequiredThreshold: 100_000,
    isLoaded: false,
  });

  useEffect(() => {
    const fetchLimits = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('setting_key, setting_value')
          .in('setting_key', ['max_transaction_amount', 'kyc_required_threshold']);

        if (error) throw error;

        const settingsMap: Record<string, string> = {};
        data?.forEach(row => {
          settingsMap[row.setting_key] = row.setting_value;
        });

        setLimits({
          maxTransactionAmount: parseFloat(settingsMap.max_transaction_amount) || 1_000_000,
          kycRequiredThreshold: parseFloat(settingsMap.kyc_required_threshold) || 100_000,
          isLoaded: true,
        });
      } catch (err) {
        console.error('Failed to fetch transaction limits, using defaults:', err);
        setLimits(prev => ({ ...prev, isLoaded: true }));
      }
    };

    fetchLimits();
  }, []);

  return limits;
};

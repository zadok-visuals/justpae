
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export const usePinAuth = () => {
  const { user } = useAuth();
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      checkPinExists();
    } else {
      setHasPin(null);
      setLoading(false);
    }
  }, [user?.id]);

  const checkPinExists = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase.rpc('user_has_pin');
      
      if (error) {
        console.error('Error checking PIN existence:', error);
        setHasPin(false);
      } else {
        setHasPin(data);
      }
    } catch (error) {
      console.error('Error checking PIN:', error);
      setHasPin(false);
    } finally {
      setLoading(false);
    }
  };

  const setPin = async (pin: string): Promise<boolean> => {
    if (!user?.id) {
      console.error('No user ID found for PIN setup');
      return false;
    }
    
    try {
      const { data, error } = await supabase.rpc('create_user_pin', {
        pin_input: pin
      });
      
      if (error) {
        console.error('Error creating PIN:', error);
        return false;
      }
      
      if (data) {
        console.log('PIN successfully created for user:', user.id);
        setHasPin(true);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error setting PIN:', error);
      return false;
    }
  };

  const changePin = async (oldPin: string, newPin: string): Promise<boolean> => {
    if (!user?.id) return false;
    
    try {
      const { data, error } = await supabase.rpc('update_user_pin', {
        old_pin: oldPin,
        new_pin: newPin
      });
      
      if (error) {
        console.error('Error changing PIN:', error);
        return false;
      }
      
      if (data) {
        console.log('PIN successfully changed for user:', user.id);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error changing PIN:', error);
      return false;
    }
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (!user?.id) return false;
    
    try {
      const { data, error } = await supabase.rpc('verify_user_pin', {
        pin_input: pin
      });
      
      if (error) {
        console.error('Error verifying PIN:', error);
        return false;
      }
      
      const isValid = data === true;
      console.log('PIN verification for user:', user.id, 'result:', isValid);
      return isValid;
    } catch (error) {
      console.error('Error verifying PIN:', error);
      return false;
    }
  };

  const deletePin = async (): Promise<boolean> => {
    if (!user?.id) return false;
    
    try {
      const { data, error } = await supabase.rpc('delete_user_pin');
      
      if (error) {
        console.error('Error deleting PIN:', error);
        return false;
      }
      
      if (data) {
        console.log('PIN successfully deleted for user:', user.id);
        setHasPin(false);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error deleting PIN:', error);
      return false;
    }
  };

  const isPinEnabled = (): boolean => {
    return hasPin === true;
  };

  const setPinEnabled = (enabled: boolean): void => {
    // Since PINs are now stored in database, we don't need separate enabled state
    // The existence of the PIN in the database determines if it's enabled
    console.log('PIN enabled state managed by database presence for user:', user?.id);
  };

  const requirePasswordForPinChange = () => {
    return true;
  };

  return {
    hasPin,
    loading,
    setPin,
    changePin,
    verifyPin,
    deletePin,
    requirePasswordForPinChange,
    isPinEnabled,
    setPinEnabled,
    checkPinExists
  };
};

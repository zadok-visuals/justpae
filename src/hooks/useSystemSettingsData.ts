
import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { systemSettingsService, SystemSetting, SystemSettingsFormData } from '@/services/systemSettingsService';

export const useSystemSettingsData = () => {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<SystemSettingsFormData>({
    maintenance_mode: false,
    max_transaction_amount: '',
    kyc_required_threshold: '',
    notification_templates: ''
  });
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      console.log('Fetching system settings for admin user:', user.id);
      
      // Verify admin status first
      await systemSettingsService.verifyAdminStatus(user.id);

      const data = await systemSettingsService.fetchSystemSettings();
      const processedFormData = systemSettingsService.processSettingsData(data);

      setSettings(data);
      setFormData(processedFormData);
    } catch (error: any) {
      console.error('Error fetching settings:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch system settings",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  return {
    settings,
    loading,
    formData,
    setFormData,
    fetchSettings
  };
};

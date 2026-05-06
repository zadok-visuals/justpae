
import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { systemSettingsService, SystemSettingsFormData } from '@/services/systemSettingsService';

interface UseSystemSettingsSaveProps {
  formData: SystemSettingsFormData;
  onSettingsSaved: () => void;
}

export const useSystemSettingsSave = ({ formData, onSettingsSaved }: UseSystemSettingsSaveProps) => {
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const saveSettings = useCallback(async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to save settings.",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      console.log('Saving settings with form data:', formData);

      // Verify admin status again before saving
      await systemSettingsService.verifyAdminStatus(user.id);

      const updates = systemSettingsService.validateAndProcessFormData(formData);

      console.log('Processing updates:', updates);

      // Process updates sequentially to avoid conflicts
      for (const { key, value } of updates) {
        await systemSettingsService.updateSystemSetting(key, value, user.id);
        console.log(`Successfully processed update for ${key}`);
      }

      toast({
        title: "Success",
        description: "All system settings updated successfully",
      });
      
      // Refresh settings after successful save
      onSettingsSaved();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }, [user, formData, toast, onSettingsSaved]);

  return {
    saving,
    saveSettings
  };
};

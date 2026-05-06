
import { useEffect } from 'react';
import { useSystemSettingsData } from './useSystemSettingsData';
import { useSystemSettingsSave } from './useSystemSettingsSave';

export const useSystemSettings = () => {
  const {
    settings,
    loading,
    formData,
    setFormData,
    fetchSettings
  } = useSystemSettingsData();

  const { saving, saveSettings } = useSystemSettingsSave({
    formData,
    onSettingsSaved: fetchSettings
  });

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    saving,
    formData,
    setFormData,
    saveSettings,
    fetchSettings
  };
};

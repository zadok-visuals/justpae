
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Save } from 'lucide-react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import MaintenanceModeSection from './settings/MaintenanceModeSection';
import TransactionLimitsSection from './settings/TransactionLimitsSection';
import NotificationTemplatesSection from './settings/NotificationTemplatesSection';
import CurrentSettingsDisplay from './settings/CurrentSettingsDisplay';

const SystemSettings = () => {
  const {
    settings,
    loading,
    saving,
    formData,
    setFormData,
    saveSettings
  } = useSystemSettings();
  const [isTemplatesJsonValid, setIsTemplatesJsonValid] = useState(true);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fintech-orange"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center">
            <Settings className="w-5 h-5 mr-2 text-fintech-orange" />
            System Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <MaintenanceModeSection
            maintenanceMode={formData.maintenance_mode}
            onToggle={(checked) => setFormData(prev => ({ ...prev, maintenance_mode: checked }))}
          />

          <TransactionLimitsSection
            maxTransactionAmount={formData.max_transaction_amount}
            kycRequiredThreshold={formData.kyc_required_threshold}
            onMaxAmountChange={(value) => setFormData(prev => ({ ...prev, max_transaction_amount: value }))}
            onKycThresholdChange={(value) => setFormData(prev => ({ ...prev, kyc_required_threshold: value }))}
          />

          <NotificationTemplatesSection
            notificationTemplates={formData.notification_templates}
            onChange={(value) => setFormData(prev => ({ ...prev, notification_templates: value }))}
            onValidation={setIsTemplatesJsonValid}
          />

          <Button
            onClick={saveSettings}
            disabled={saving || !isTemplatesJsonValid}
            className="w-full bg-fintech-orange hover:bg-fintech-orange/90"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>

      <CurrentSettingsDisplay settings={settings} />
    </div>
  );
};

export default SystemSettings;

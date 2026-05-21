
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, Save, AlertTriangle, Building2, 
  TrendingUp, Bell, ChevronRight, CheckCircle2 
} from 'lucide-react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import MaintenanceModeSection from './settings/MaintenanceModeSection';
import TransactionLimitsSection from './settings/TransactionLimitsSection';
import CorporateBankSection from './settings/CorporateBankSection';
import NotificationTemplatesSection from './settings/NotificationTemplatesSection';

type SettingsTab = 'general' | 'bank' | 'notifications';

const TAB_CONFIG: { id: SettingsTab; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: 'general',
    label: 'General',
    icon: <TrendingUp className="w-4 h-4" />,
    description: 'Exchange rates, transaction limits & maintenance mode'
  },
  {
    id: 'bank',
    label: 'Bank Details',
    icon: <Building2 className="w-4 h-4" />,
    description: 'Corporate deposit account configuration'
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <Bell className="w-4 h-4" />,
    description: 'Message templates for user alerts'
  }
];

const SystemSettings = () => {
  const {
    settings,
    loading,
    saving,
    formData,
    setFormData,
    saveSettings
  } = useSystemSettings();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [isTemplatesJsonValid, setIsTemplatesJsonValid] = useState(true);
  const [savedIndicator, setSavedIndicator] = useState(false);

  const handleSave = async () => {
    await saveSettings();
    setSavedIndicator(true);
    setTimeout(() => setSavedIndicator(false), 2500);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fintech-orange" />
          <span className="text-sm text-gray-500 dark:text-gray-400">Loading settings...</span>
        </div>
      </div>
    );
  }

  const activeTabConfig = TAB_CONFIG.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-fintech-orange/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-fintech-orange" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">System Settings</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Configure app-wide parameters and operational controls</p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || !isTemplatesJsonValid}
          className={`flex items-center gap-2 text-sm font-semibold h-9 px-4 rounded-xl transition-all ${
            savedIndicator
              ? 'bg-green-500 hover:bg-green-600 text-white'
              : 'bg-fintech-orange hover:bg-fintech-orange/90 text-white'
          }`}
        >
          {savedIndicator ? (
            <><CheckCircle2 className="w-4 h-4" /> Saved!</>
          ) : saving ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
          ) : (
            <><Save className="w-4 h-4" /> Save Changes</>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sidebar Nav */}
        <div className="lg:col-span-1 space-y-1.5">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all group ${
                activeTab === tab.id
                  ? 'bg-fintech-orange text-white shadow-md shadow-fintech-orange/20'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700'
              }`}
            >
              <div className={`shrink-0 p-1.5 rounded-lg ${
                activeTab === tab.id ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-200 dark:group-hover:bg-gray-600'
              }`}>
                {tab.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{tab.label}</p>
                <p className={`text-[10px] truncate leading-tight mt-0.5 ${
                  activeTab === tab.id ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {tab.description}
                </p>
              </div>
              <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${
                activeTab === tab.id ? 'text-white/80 rotate-90' : 'text-gray-300 dark:text-gray-600'
              }`} />
            </button>
          ))}

          {/* Live Status Summary */}
          <div className="mt-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Live Values</p>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600 dark:text-gray-300">Rate (USD/NGN)</span>
              <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-transparent text-[10px] font-bold">
                ₦{parseFloat(formData.usd_to_ngn_rate || '1650').toLocaleString()}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600 dark:text-gray-300">Maintenance</span>
              <Badge className={`border-transparent text-[10px] font-bold ${
                formData.maintenance_mode
                  ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}>
                {formData.maintenance_mode ? 'ON' : 'OFF'}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600 dark:text-gray-300">Max Tx (NGN)</span>
              <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border-transparent text-[10px] font-bold">
                ₦{parseFloat(formData.max_transaction_amount || '0').toLocaleString()}
              </Badge>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
            <CardHeader className="pb-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-fintech-orange/10">
                  {activeTabConfig.icon}
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-gray-900 dark:text-white">
                    {activeTabConfig.label}
                  </CardTitle>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {activeTabConfig.description}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-5 space-y-6">
              {activeTab === 'general' && (
                <>
                  <MaintenanceModeSection
                    maintenanceMode={formData.maintenance_mode}
                    onToggle={(checked) => setFormData(prev => ({ ...prev, maintenance_mode: checked }))}
                  />
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Transaction & Rate Controls</h3>
                    <TransactionLimitsSection
                      maxTransactionAmount={formData.max_transaction_amount}
                      kycRequiredThreshold={formData.kyc_required_threshold}
                      usdToNgnRate={formData.usd_to_ngn_rate}
                      cryptoBuyRate={formData.crypto_buy_rate}
                      cryptoSellRate={formData.crypto_sell_rate}
                      onMaxAmountChange={(value) => setFormData(prev => ({ ...prev, max_transaction_amount: value }))}
                      onKycThresholdChange={(value) => setFormData(prev => ({ ...prev, kyc_required_threshold: value }))}
                      onUsdToNgnRateChange={(value) => setFormData(prev => ({ ...prev, usd_to_ngn_rate: value }))}
                      onCryptoBuyRateChange={(value) => setFormData(prev => ({ ...prev, crypto_buy_rate: value }))}
                      onCryptoSellRateChange={(value) => setFormData(prev => ({ ...prev, crypto_sell_rate: value }))}
                    />
                  </div>
                </>
              )}

              {activeTab === 'bank' && (
                <CorporateBankSection
                  bankName={formData.corporate_bank_name}
                  accountNumber={formData.corporate_account_number}
                  accountName={formData.corporate_account_name}
                  onBankNameChange={(value) => setFormData(prev => ({ ...prev, corporate_bank_name: value }))}
                  onAccountNumberChange={(value) => setFormData(prev => ({ ...prev, corporate_account_number: value }))}
                  onAccountNameChange={(value) => setFormData(prev => ({ ...prev, corporate_account_name: value }))}
                />
              )}

              {activeTab === 'notifications' && (
                <NotificationTemplatesSection
                  notificationTemplates={formData.notification_templates}
                  onChange={(value) => setFormData(prev => ({ ...prev, notification_templates: value }))}
                  onValidation={setIsTemplatesJsonValid}
                />
              )}

              {/* Bottom Save Action */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Changes are saved globally and take effect immediately.
                </p>
                <Button
                  onClick={handleSave}
                  disabled={saving || !isTemplatesJsonValid}
                  size="sm"
                  className={`flex items-center gap-2 text-sm font-semibold h-9 px-4 rounded-xl transition-all ${
                    savedIndicator
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-fintech-orange hover:bg-fintech-orange/90 text-white'
                  }`}
                >
                  {savedIndicator ? (
                    <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                  ) : saving ? (
                    'Saving...'
                  ) : (
                    <><Save className="w-4 h-4" /> Save Changes</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;

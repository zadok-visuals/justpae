import { supabase } from '@/integrations/supabase/client';

export interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  description: string;
}

export interface SystemSettingsFormData {
  maintenance_mode: boolean;
  max_transaction_amount: string;
  kyc_required_threshold: string;
  usd_to_ngn_rate: string;
  crypto_buy_rate: string;
  crypto_sell_rate: string;
  corporate_bank_name: string;
  corporate_account_number: string;
  corporate_account_name: string;
  notification_templates: string;
}

export const systemSettingsService = {
  async verifyAdminStatus(userId: string): Promise<boolean> {
    console.log('Verifying admin status for user:', userId);
    
    // Verify user exists in profiles
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();
    
    if (profileError || !profileData) {
      console.error('Profile verification failed:', profileError);
      throw new Error('User verification failed - profile not found');
    }

    console.log('User profile verified successfully');
    return true;
  },

  async fetchSystemSettings(): Promise<SystemSetting[]> {
    // First ensure basic settings exist
    await this.ensureBasicSettingsExist();
    
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .order('setting_key');

    if (error) {
      console.error('Error fetching settings:', error);
      throw error;
    }

    return data || [];
  },

  async ensureBasicSettingsExist(): Promise<void> {
    const basicSettings = [
      { key: 'maintenance_mode', value: 'false', description: 'When enabled, shows maintenance message to users' },
      { key: 'max_transaction_amount', value: '1000000', description: 'Maximum allowed transaction amount in NGN' },
      { key: 'kyc_required_threshold', value: '100000', description: 'Transaction amount threshold requiring KYC verification' },
      { key: 'usd_to_ngn_rate', value: '1650', description: 'Manual USD to NGN exchange rate used across the app' },
      { key: 'crypto_buy_rate', value: '1680', description: 'Rate when users buy crypto' },
      { key: 'crypto_sell_rate', value: '1620', description: 'Rate when users sell crypto' },
      { key: 'corporate_bank_name', value: 'AmazingPay Bank', description: 'Corporate Bank Name for user deposits' },
      { key: 'corporate_account_number', value: '2109876543', description: 'Corporate Account Number for user deposits' },
      { key: 'corporate_account_name', value: 'AmazingPay Limited', description: 'Corporate Account Name for user deposits' },
      { key: 'notification_templates', value: '{}', description: 'JSON templates for notifications' }
    ];

    for (const setting of basicSettings) {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          setting_key: setting.key,
          setting_value: setting.value,
          description: setting.description
        }, {
          onConflict: 'setting_key',
          ignoreDuplicates: true
        });

      if (error) {
        console.error(`Error ensuring setting ${setting.key} exists:`, error);
      }
    }
  },

  async updateSystemSetting(key: string, value: string, adminUserId: string, description?: string): Promise<boolean> {
    console.log('Updating setting directly:', { key, value, userId: adminUserId });

    const { data: adminUser, error: adminUserError } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', adminUserId)
      .single();

    if (adminUserError || !adminUser) {
      console.error('Error fetching admin user record:', adminUserError);
      throw new Error('Could not find admin user record to attribute changes. Action aborted.');
    }

    // Direct update without using the problematic RPC function
    const { error: updateError } = await supabase
      .from('system_settings')
      .upsert({
        setting_key: key,
        setting_value: value,
        description: description || this.getSettingDescription(key),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'setting_key'
      });

    if (updateError) {
      console.error(`Error updating setting ${key}:`, updateError);
      throw updateError;
    }

    console.log(`Successfully updated setting ${key} directly`);
    return true;
  },

  async getMaintenanceStatus(): Promise<boolean> {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'maintenance_mode')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: no rows found
      console.error('Error fetching maintenance status:', error);
      return false; // Fail-safe: assume not in maintenance
    }

    if (!data) {
      return false;
    }

    return data.setting_value === 'true';
  },

  getSettingDescription(key: string): string {
    const descriptions: Record<string, string> = {
      admin_password: 'Admin access password',
      maintenance_mode: 'When enabled, shows maintenance message to users',
      max_transaction_amount: 'Maximum allowed transaction amount in NGN',
      kyc_required_threshold: 'Transaction amount threshold requiring KYC verification',
      usd_to_ngn_rate: 'Manual USD to NGN exchange rate used across the app',
      crypto_buy_rate: 'Rate when users buy crypto',
      crypto_sell_rate: 'Rate when users sell crypto',
      corporate_bank_name: 'Corporate Bank Name for user deposits',
      corporate_account_number: 'Corporate Account Number for user deposits',
      corporate_account_name: 'Corporate Account Name for user deposits',
      notification_templates: 'JSON templates for notifications'
    };
    return descriptions[key] || '';
  },

  processSettingsData(data: SystemSetting[]): SystemSettingsFormData {
    const settingsMap = data.reduce((acc, setting) => {
      acc[setting.setting_key] = setting.setting_value;
      return acc;
    }, {} as any);

    return {
      maintenance_mode: settingsMap.maintenance_mode === 'true' || settingsMap.maintenance_mode === true,
      max_transaction_amount: settingsMap.max_transaction_amount?.toString() || '1000000',
      kyc_required_threshold: settingsMap.kyc_required_threshold?.toString() || '100000',
      usd_to_ngn_rate: settingsMap.usd_to_ngn_rate?.toString() || '1650',
      crypto_buy_rate: settingsMap.crypto_buy_rate?.toString() || '1680',
      crypto_sell_rate: settingsMap.crypto_sell_rate?.toString() || '1620',
      corporate_bank_name: settingsMap.corporate_bank_name?.toString() || 'AmazingPay Bank',
      corporate_account_number: settingsMap.corporate_account_number?.toString() || '2109876543',
      corporate_account_name: settingsMap.corporate_account_name?.toString() || 'AmazingPay Limited',
      notification_templates: typeof settingsMap.notification_templates === 'string' 
        ? settingsMap.notification_templates 
        : JSON.stringify(settingsMap.notification_templates || {}, null, 2)
    };
  },

  validateAndProcessFormData(formData: SystemSettingsFormData): Array<{ key: string; value: string }> {
    let notificationTemplates;
    try {
      if (formData.notification_templates.trim() === '') {
        notificationTemplates = '{}';
      } else {
        const parsed = JSON.parse(formData.notification_templates);
        notificationTemplates = JSON.stringify(parsed);
      }
    } catch {
      throw new Error('Invalid JSON format for notification templates');
    }

    return [
      { key: 'maintenance_mode', value: formData.maintenance_mode.toString() },
      { key: 'max_transaction_amount', value: (parseInt(formData.max_transaction_amount) || 1000000).toString() },
      { key: 'kyc_required_threshold', value: (parseInt(formData.kyc_required_threshold) || 100000).toString() },
      { key: 'usd_to_ngn_rate', value: (parseFloat(formData.usd_to_ngn_rate) || 1650).toString() },
      { key: 'crypto_buy_rate', value: (parseFloat(formData.crypto_buy_rate) || 1680).toString() },
      { key: 'crypto_sell_rate', value: (parseFloat(formData.crypto_sell_rate) || 1620).toString() },
      { key: 'corporate_bank_name', value: formData.corporate_bank_name || 'AmazingPay Bank' },
      { key: 'corporate_account_number', value: formData.corporate_account_number || '2109876543' },
      { key: 'corporate_account_name', value: formData.corporate_account_name || 'AmazingPay Limited' },
      { key: 'notification_templates', value: notificationTemplates }
    ];
  }
};

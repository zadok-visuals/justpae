
import React, { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface NotificationTemplatesSectionProps {
  notificationTemplates: string;
  onChange: (value: string) => void;
  onValidation: (isValid: boolean) => void;
}

const NotificationTemplatesSection: React.FC<NotificationTemplatesSectionProps> = ({
  notificationTemplates,
  onChange,
  onValidation,
}) => {
  const [jsonError, setJsonError] = useState<string | null>(null);

  const placeholderJson = `{
  "welcome": "Welcome to our platform, {{username}}!",
  "new_login": "A new login to your account was detected from {{device}}.",
  "transaction_success": "Your transaction of NGN{{amount}} to {{recipient}} was successful.",
  "transaction_failed": "Your transaction of NGN{{amount}} failed. Reason: {{reason}}.",
  "kyc_approved": "Congratulations! Your KYC verification has been approved.",
  "password_reset": "Your password has been successfully reset."
}`;
  
  const sampleTemplates = JSON.parse(placeholderJson);

  useEffect(() => {
    if (notificationTemplates.trim() === '') {
      setJsonError(null);
      onValidation(true);
      return;
    }
    try {
      JSON.parse(notificationTemplates);
      setJsonError(null);
      onValidation(true);
    } catch (error) {
      setJsonError('Invalid JSON format.');
      onValidation(false);
    }
  }, [notificationTemplates, onValidation]);

  return (
    <div className="space-y-2">
      <Label className="text-gray-900 dark:text-white">Notification Templates (JSON)</Label>
      <Textarea
        value={notificationTemplates}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholderJson}
        rows={10}
        className={cn(
          "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono text-sm",
          jsonError && "border-red-500 focus-visible:ring-red-500"
        )}
      />
      {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
      <p className="text-xs text-gray-500">
        JSON object containing notification templates. Use{' '}
        <code>{'{{variable_name}}'}</code> for placeholders.
      </p>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Template Reference</h4>
        <div className="mt-2 space-y-2 text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900/50 p-3 rounded-md">
          {Object.entries(sampleTemplates).map(([key, value]) => (
            <div key={key}>
              <span className="font-semibold text-gray-800 dark:text-gray-200">"{key}":</span>
              <span className="ml-2 text-gray-500 dark:text-gray-400">"{value as string}"</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NotificationTemplatesSection;


import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: any;
  description: string;
}

interface CurrentSettingsDisplayProps {
  settings: SystemSetting[];
}

const CurrentSettingsDisplay: React.FC<CurrentSettingsDisplayProps> = ({ settings }) => {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-gray-900 dark:text-white">Current Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {settings.map((setting) => (
            <div key={setting.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{setting.setting_key}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{setting.description}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-900 dark:text-white">
                  {typeof setting.setting_value === 'object' 
                    ? JSON.stringify(setting.setting_value)
                    : setting.setting_value?.toString()
                  }
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default CurrentSettingsDisplay;

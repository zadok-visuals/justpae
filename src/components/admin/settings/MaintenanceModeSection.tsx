
import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

interface MaintenanceModeSectionProps {
  maintenanceMode: boolean;
  onToggle: (checked: boolean) => void;
}

const MaintenanceModeSection: React.FC<MaintenanceModeSectionProps> = ({
  maintenanceMode,
  onToggle
}) => {
  return (
    <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-center space-x-3">
        <AlertTriangle className="w-5 h-5 text-yellow-500" />
        <div>
          <Label className="text-gray-900 dark:text-white font-medium">Maintenance Mode</Label>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            When enabled, users will see a maintenance message
          </p>
        </div>
      </div>
      <Switch
        checked={maintenanceMode}
        onCheckedChange={onToggle}
      />
    </div>
  );
};

export default MaintenanceModeSection;

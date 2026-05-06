
import React, { useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { systemSettingsService } from '@/services/systemSettingsService';
import MaintenancePage from './maintenance/MaintenancePage';

const MaintenanceGuard = ({ children }: { children: ReactNode }) => {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const checkMaintenanceStatus = async () => {
      try {
        const status = await systemSettingsService.getMaintenanceStatus();
        setIsMaintenanceMode(status);
      } catch (error) {
        console.error("Failed to check maintenance status", error);
        setIsMaintenanceMode(false);
      } finally {
        setLoading(false);
      }
    };

    checkMaintenanceStatus();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-fintech-orange"></div>
      </div>
    );
  }

  const isAdminRoute = location.pathname.startsWith('/admin');

  if (isMaintenanceMode && !isAdminRoute) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
};

export default MaintenanceGuard;


import React from 'react';
import MaintenanceGuard from './MaintenanceGuard';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  return (
    <MaintenanceGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="w-full">
          {children}
        </div>
      </div>
    </MaintenanceGuard>
  );
};

export default AdminLayout;

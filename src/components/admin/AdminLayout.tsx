import React from 'react';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  return (
    <div className="h-screen w-full bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Scrollable Content Container */}
      <div className="w-full flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
};

export default AdminLayout;

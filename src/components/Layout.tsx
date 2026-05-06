
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from './Navbar';
import MaintenanceGuard from './MaintenanceGuard';

interface LayoutProps {
  children: React.ReactNode;
  showNavbar?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, showNavbar = true }) => {
  const { isAuthenticated } = useAuth();

  return (
    <MaintenanceGuard>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md mx-auto bg-white dark:bg-gray-900 min-h-screen shadow-xl relative">
        {children}
        {showNavbar && isAuthenticated && <Navbar />}
      </div>
      </div>
    </MaintenanceGuard>
  );
};

export default Layout;

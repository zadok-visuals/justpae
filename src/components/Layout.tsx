import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from './Navbar';
import MaintenanceGuard from './MaintenanceGuard';

interface LayoutProps {
  children: React.ReactNode;
  showNavbar?: boolean;
  fullWidth?: boolean; // New prop to toggle centering
}

const Layout: React.FC<LayoutProps> = ({ children, showNavbar = true, fullWidth = false }) => {
  const { isAuthenticated } = useAuth();

  return (
    <MaintenanceGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
        <div className="w-full relative overflow-x-hidden">
          {/* If fullWidth is true, we remove the max-width and padding */}
          <main className={fullWidth ? "w-full" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 md:pt-16 pb-16 md:pb-0"}>
            {children}
          </main>
          {showNavbar && isAuthenticated && <Navbar />}
        </div>
      </div>
    </MaintenanceGuard>
  );
};

export default Layout;

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from './Navbar';
import MaintenanceGuard from './MaintenanceGuard';

interface LayoutProps {
  children: React.ReactNode;
  showNavbar?: boolean;
  fullWidth?: boolean; 
}

const Layout: React.FC<LayoutProps> = ({ children, showNavbar = true, fullWidth = false }) => {
  const { isAuthenticated } = useAuth();

  return (
    <MaintenanceGuard>
      {/* 
        FIXES APPLIED:
        1. Added "max-w-full" and "box-border" to strictly clip elements to the visible viewport.
        2. Swapped "overflow-y-auto" to "overflow-x-hidden overflow-y-auto" to instantly terminate horizontal side bleeding.
      */}
      <div className="h-screen w-full max-w-full box-border bg-gray-50 dark:bg-gray-900 transition-colors duration-300 overflow-x-hidden overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="w-full relative box-border">
          
          {/* Main Content Layout Block */}
          <main className={fullWidth ? "w-full box-border" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 md:pt-16 pb-16 md:pb-0 box-border"}>
            {children}
          </main>
          
          {showNavbar && isAuthenticated && <Navbar />}
        </div>
      </div>
    </MaintenanceGuard>
  );
};

export default Layout;

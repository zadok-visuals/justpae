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
          {/* 1. The Status Bar Background Shield: \""fixed\" ensures it anchors to the very top of your phone screen, not your page body. \"h-safe-top\" perfectly matches the thickness of your status bar area. \"z-50\" forces it to float on top of all content. */}
          <div className="fixed top-0 left-0 right-0 h-safe-top bg-white dark:bg-gray-900 z-50 pointer-events-none transition-colors duration-300" />


          {/* 2. The Main Workspace Container: We now explicitly pull this container down by the height of the status bar (h-safe-top) to ensure the top of your first card starts exactly where the status bar ends. */}
          <main className={fullWidth ? "w-full box-border pt-safe-top" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 md:pt-16 pb-16 md:pb-0 box-border pt-safe-top"}>
            {children}
          </main>
          
          {showNavbar && isAuthenticated && <Navbar />}
        </div>
      </div>
    </MaintenanceGuard>
  );
};

export default Layout;

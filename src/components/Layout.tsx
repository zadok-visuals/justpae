import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from './Navbar';
import MaintenanceGuard from './MaintenanceGuard';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  showNavbar?: boolean;
  fullWidth?: boolean;
  noScroll?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  showNavbar = true, 
  fullWidth = false,
  noScroll = false 
}) => {
  const { isAuthenticated } = useAuth();

  return (
    <MaintenanceGuard>
      <div className="flex flex-col h-full w-full bg-gray-50 dark:bg-gray-900 transition-colors duration-300 overflow-hidden">
        
        {/* 1. TOP SHIELD: Protects the status bar/notch area + Navbar space */}
        <div 
          className="flex-none bg-white dark:bg-gray-900 z-[100] border-b border-gray-100 dark:border-gray-800 shadow-sm"
          style={{ height: 'calc(env(safe-area-inset-top, 20px) + 48px)' }}
        />

        {/* 2. MAIN AREA: Handled as a flex-1 to allow internal scrolling or global scrolling */}
        <div className={cn(
          "flex-1 relative",
          noScroll ? "overflow-hidden" : "overflow-x-hidden overflow-y-auto overscroll-touch [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        )}>
          <main className="w-full h-full box-border">
            <div className={cn(
              "mx-auto h-full",
              fullWidth ? "w-full" : "max-w-7xl px-4 sm:px-6 lg:px-8",
              // We remove the top padding here so sticky headers can touch the top shield perfectly
              noScroll ? "" : "pb-40 md:pb-20" 
            )}>
              {children}
            </div>
          </main>
        </div>
        
        {showNavbar && isAuthenticated && (
          <div className="flex-none z-[100]">
            <Navbar />
            {/* 3. BOTTOM SAFE ZONE: Extra padding below the navbar for the home indicator */}
            <div 
              className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800"
              style={{ height: 'calc(env(safe-area-inset-bottom, 20px) + 10px)' }} // Increased padding
            />
          </div>
        )}
      </div>
    </MaintenanceGuard>
  );
};

export default Layout;

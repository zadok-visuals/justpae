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
      {/* 
        MASTER SHELL:
        - h-[100dvh] + overflow-hidden: Prevents the browser from scrolling/bouncing.
      */}
      <div className="flex flex-col h-[100dvh] w-full bg-gray-50 dark:bg-gray-900 overflow-hidden">
        
        {/* STACK 1: TOP SHIELD (Status Bar Protector) */}
        <div 
          className="flex-none bg-white dark:bg-gray-900 z-50 border-b border-gray-100 dark:border-gray-800"
          style={{ height: 'calc(env(safe-area-inset-top, 20px) + 48px)' }}
        />

        {/* STACK 2: CONTENT REGION 
            - flex-1 + min-h-0 + flex flex-col: This allows internal scrolling.
        */}
        <div className="flex-1 flex flex-col min-h-0 w-full relative">
          <main className={cn(
            "w-full mx-auto flex flex-col",
            // If noScroll is true (Chat), we MUST lock the height to exactly 100% of available space
            noScroll ? "h-full overflow-hidden" : "min-h-full overflow-x-hidden overflow-y-auto overscroll-touch [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-10",
            fullWidth ? "" : "max-w-7xl px-4 sm:px-6 lg:px-8"
          )}>
            {children}
          </main>
        </div>
        
        {/* STACK 3: BOTTOM NAVIGATION (Navbar + Home Indicator) */}
        {showNavbar && (
          <div className="flex-none bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 z-50">
            <Navbar />
            <div 
              className="w-full bg-white dark:bg-gray-900"
              style={{ height: 'env(safe-area-inset-bottom, 20px)' }}
            />
          </div>
        )}
      </div>
    </MaintenanceGuard>
  );
};

export default Layout;

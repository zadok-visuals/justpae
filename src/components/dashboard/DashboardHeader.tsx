
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Settings, Bell } from 'lucide-react';

interface DashboardHeaderProps {
  userName: string;
  unreadNotifications: number;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  userName,
  unreadNotifications
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Hello, {userName} 👋
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">What are you trading today?</p>
        </div>
        <div className="flex items-center space-x-3">
          <Link to="/notifications" className="relative">
            <Button variant="ghost" size="sm" className="p-2">
              <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </Button>
          </Link>
          <Link to="/settings">
            <Button variant="ghost" size="sm" className="p-2">
              <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;

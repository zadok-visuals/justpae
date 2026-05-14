
import React from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { LogOut, Sun, Moon, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminHeader = () => {
  const { user, profile, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logout();
    navigate('/admin-login');
  };

  const getInitials = (name?: any) => {
    if (!name || typeof name !== 'string') return 'A';
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
          <p className="hidden sm:block text-sm text-gray-600 dark:text-gray-400">Manage and monitor your fintech platform</p>
        </div>
        
        <div className="flex items-center justify-between sm:justify-end space-x-2 sm:space-x-4">
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white h-9 w-9"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>

            {/* Profile Avatar */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Avatar className="w-8 h-8">
                <AvatarImage src={profile?.avatar_url} alt={profile?.full_name || 'Admin'} />
                <AvatarFallback className="bg-fintech-orange text-white text-sm">
                  {profile?.full_name ? getInitials(profile.full_name) : <User className="w-4 h-4" />}
                </AvatarFallback>
              </Avatar>
              <div className="text-sm hidden xs:block">
                <p className="font-medium text-gray-900 dark:text-white truncate max-w-[100px] sm:max-w-none">
                  {profile?.full_name || 'Admin'}
                </p>
                <p className="hidden md:block text-gray-500 dark:text-gray-400 text-xs">
                  {user?.email}
                </p>
              </div>
            </div>
          </div>

          {/* Sign Out Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border-gray-200 dark:border-gray-700 h-9"
          >
            <LogOut className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminHeader;


import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Bell, CheckCheck } from 'lucide-react';

interface NotificationHeaderProps {
  unreadCount: number;
  onMarkAllAsRead: () => void;
}

const NotificationHeader: React.FC<NotificationHeaderProps> = ({
  unreadCount,
  onMarkAllAsRead
}) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Link to="/dashboard">
          <Button variant="ghost" size="sm" className="p-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
            <Bell className="w-6 h-6 mr-2 text-fintech-orange" />
            Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
      {unreadCount > 0 && (
        <Button
          onClick={onMarkAllAsRead}
          variant="outline"
          size="sm"
          className="flex items-center space-x-2"
        >
          <CheckCheck className="w-4 h-4" />
          <span>Mark all read</span>
        </Button>
      )}
    </div>
  );
};

export default NotificationHeader;

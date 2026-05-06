
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Bell } from 'lucide-react';
import NotificationCard from './NotificationCard';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationListProps {
  notifications: Notification[];
  loading: boolean;
  onMarkAsRead: (id: string) => void;
}

const NotificationList: React.FC<NotificationListProps> = ({
  notifications,
  loading,
  onMarkAsRead
}) => {
  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fintech-orange"></div>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
        <CardContent className="p-8 text-center">
          <Bell className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No notifications yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            You'll see important updates and messages here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {notifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          onMarkAsRead={onMarkAsRead}
        />
      ))}
    </div>
  );
};

export default NotificationList;

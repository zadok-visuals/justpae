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
  sender_id?: string;
  conversation_id?: string;
}

interface NotificationListProps {
  notifications: Notification[];
  loading: boolean;
  onMarkAsRead: (id: string) => void;
  onNotificationClick: (notification: Notification) => void; // Added click action handler prop
}

const NotificationList: React.FC<NotificationListProps> = ({
  notifications,
  loading,
  onMarkAsRead,
  onNotificationClick // Decoupled structural action callback instance
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
      <Card className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border-gray-100 dark:border-neutral-800">
        <CardContent className="p-8 text-center">
          <Bell className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
            No notifications yet
          </h3>
          <p className="text-xs text-gray-400">
            You'll see important updates and messages here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2.5">
      {notifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          onMarkAsRead={onMarkAsRead}
          onClick={() => onNotificationClick(notification)} // Bound navigation click sequence trigger
        />
      ))}
    </div>
  );
};

export default NotificationList;

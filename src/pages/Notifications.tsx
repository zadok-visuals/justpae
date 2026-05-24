import React from 'react';
import NotificationHeader from '@/components/notifications/NotificationHeader';
import NotificationList from '@/components/notifications/NotificationList';
import { useNotifications } from '@/hooks/useNotifications';

interface NotificationItem {
  id: string;
  type: string;
  sender_id?: string;
  conversation_id?: string;
  message?: string;
  is_read: boolean;
}

const Notifications = () => {
  const {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead
  } = useNotifications();

  const handleNotificationClick = async (notification: NotificationItem) => {
    // 1. Mark item as read defensively inside server state
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    // 2. Hardened routing verification mapping directly to your support view
    const targetId = notification.conversation_id || notification.sender_id;
    
    if (targetId) {
      // Direct pass link layout connection
      window.location.href = `/chat?id=${targetId}`;
    } else {
      // Absolute secondary general fallback anchor if no tracking parameters are detected at all
      window.location.href = `/chat`;
    }
  };

  return (

      <div className="flex flex-col min-h-screen w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white relative">
        <div className="flex-1 w-full max-w-3xl mx-auto p-4 pb-24">
          {/* Sticky Header Layer */}
          <div className="sticky top-0 z-30 border-b border-gray-100 dark:border-gray-800 -mx-4 px-4 sm:-mx-6 sm:px-6 py-3 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-md mb-4">
            <NotificationHeader
              unreadCount={unreadCount}
              onMarkAllAsRead={markAllAsRead}
            />
          </div>

          <NotificationList
            notifications={notifications}
            loading={loading}
            onMarkAsRead={markAsRead}
            onNotificationClick={handleNotificationClick}
          />
        </div>
      </div>
  );
};

export default Notifications;

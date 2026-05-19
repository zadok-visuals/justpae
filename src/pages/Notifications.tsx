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

      <div className="flex flex-col h-[100dvh] w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white overflow-hidden relative">
        
        {/* Sticky Header Layer */}
        <div className="shrink-0 border-b border-gray-100 dark:border-gray-800 px-4 py-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md z-20">
          <div className="max-w-3xl mx-auto w-full">
            <NotificationHeader
              unreadCount={unreadCount}
              onMarkAllAsRead={markAllAsRead}
            />
          </div>
        </div>

        {/* Scroll Engine Area */}
        <div className="flex-1 overflow-y-auto bg-gray-50/30 dark:bg-gray-900/5 px-4 py-4 pb-safe-bottom scroll-smooth">
          <div className="max-w-3xl mx-auto w-full">
            <NotificationList
              notifications={notifications}
              loading={loading}
              onMarkAsRead={markAsRead}
              onNotificationClick={handleNotificationClick}
            />
          </div>
        </div>
      </div>
  );
};

export default Notifications;

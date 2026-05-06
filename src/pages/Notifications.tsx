
import React from 'react';
import Layout from '@/components/Layout';
import NotificationHeader from '@/components/notifications/NotificationHeader';
import NotificationList from '@/components/notifications/NotificationList';
import { useNotifications } from '@/hooks/useNotifications';

const Notifications = () => {
  const {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead
  } = useNotifications();

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="p-4 pb-24 space-y-6">
          <NotificationHeader
            unreadCount={unreadCount}
            onMarkAllAsRead={markAllAsRead}
          />

          <NotificationList
            notifications={notifications}
            loading={loading}
            onMarkAsRead={markAsRead}
          />
        </div>
      </div>
    </Layout>
  );
};

export default Notifications;

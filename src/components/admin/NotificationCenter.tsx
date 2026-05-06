
import React from 'react';
import NotificationForm from './notifications/NotificationForm';
import RecentNotificationsList from './notifications/RecentNotificationsList';
import { useNotificationForm } from '@/hooks/useNotificationForm';
import { useNotificationData } from '@/hooks/useNotificationData';

const NotificationCenter = () => {
  const { notifications, users, loading, fetchNotifications } = useNotificationData();
  const { formData, setFormData, sending, sendNotification } = useNotificationForm(fetchNotifications);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <NotificationForm
        formData={formData}
        setFormData={setFormData}
        users={users}
        onSend={sendNotification}
        sending={sending}
      />
      <RecentNotificationsList
        notifications={notifications}
        loading={loading}
      />
    </div>
  );
};

export default NotificationCenter;

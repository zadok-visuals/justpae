
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NotificationFormData {
  title: string;
  message: string;
  type: string;
  recipient: string;
  selectedUserId: string;
}

export const useNotificationForm = (onSuccess: () => void) => {
  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState<NotificationFormData>({
    title: '',
    message: '',
    type: 'info',
    recipient: 'all',
    selectedUserId: ''
  });
  const { toast } = useToast();

  const sendNotification = async () => {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let targetUsers = [];

      if (formData.recipient === 'all') {
        // Get all user IDs
        const { data: allUsers, error: usersError } = await supabase
          .from('profiles')
          .select('id');

        if (usersError) throw usersError;
        targetUsers = allUsers?.map(u => u.id) || [];
      } else {
        targetUsers = [formData.selectedUserId];
      }

      // Create notifications for each target user
      const notifications = targetUsers.map(userId => ({
        user_id: userId,
        title: formData.title,
        message: formData.message,
        type: formData.type,
        is_read: false
      }));

      const { error: notificationError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notificationError) throw notificationError;

      // Log admin action
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (adminData) {
        await supabase.from('admin_actions').insert({
          admin_user_id: adminData.id,
          action_type: 'send_notification',
          details: {
            title: formData.title,
            recipient: formData.recipient,
            count: notifications.length
          }
        });
      }

      toast({
        title: "Success",
        description: `Notification sent to ${notifications.length} user(s)`,
        duration: 3000,
      });

      // Reset form
      setFormData({
        title: '',
        message: '',
        type: 'info',
        recipient: 'all',
        selectedUserId: ''
      });

      onSuccess();
    } catch (error) {
      console.error('Error sending notification:', error);
      toast({
        title: "Error",
        description: "Failed to send notification",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  return {
    formData,
    setFormData,
    sending,
    sendNotification
  };
};

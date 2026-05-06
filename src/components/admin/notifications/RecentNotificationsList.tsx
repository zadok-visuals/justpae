
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  profiles: { name: string; email: string } | null;
}

interface RecentNotificationsListProps {
  notifications: Notification[];
  loading: boolean;
}

const RecentNotificationsList: React.FC<RecentNotificationsListProps> = ({
  notifications,
  loading
}) => {
  const getTypeBadge = (type: string) => {
    const variants = {
      info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    };
    return variants[type as keyof typeof variants] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-gray-900 dark:text-white flex items-center">
          <Bell className="w-5 h-5 mr-2 text-fintech-orange" />
          Recent Notifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fintech-orange"></div>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <div key={notification.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900 dark:text-white">{notification.title}</h4>
                  <Badge className={getTypeBadge(notification.type)}>
                    {notification.type}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{notification.message}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {notification.profiles ? `To: ${notification.profiles.name}` : 'To: All Users'}
                  </span>
                  <span>{new Date(notification.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentNotificationsList;

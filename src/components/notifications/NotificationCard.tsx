
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationCardProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}

const NotificationCard: React.FC<NotificationCardProps> = ({
  notification,
  onMarkAsRead
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
    <Card
      className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border-l-4 ${
        notification.is_read 
          ? 'border-l-gray-300 dark:border-l-gray-600' 
          : 'border-l-fintech-orange'
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <h3 className={`font-medium ${
                notification.is_read 
                  ? 'text-gray-700 dark:text-gray-300' 
                  : 'text-gray-900 dark:text-white'
              }`}>
                {notification.title}
              </h3>
              <Badge className={getTypeBadge(notification.type)}>
                {notification.type}
              </Badge>
              {!notification.is_read && (
                <div className="w-2 h-2 bg-fintech-orange rounded-full"></div>
              )}
            </div>
            <p className={`text-sm mb-3 ${
              notification.is_read 
                ? 'text-gray-600 dark:text-gray-400' 
                : 'text-gray-700 dark:text-gray-300'
            }`}>
              {notification.message}
            </p>
            <p className="text-xs text-gray-500">
              {new Date(notification.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center space-x-2 ml-4">
            {!notification.is_read && (
              <Button
                onClick={() => onMarkAsRead(notification.id)}
                variant="ghost"
                size="sm"
                className="p-2"
              >
                <Check className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationCard;

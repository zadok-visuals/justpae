
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Users, User } from 'lucide-react';

interface NotificationFormData {
  title: string;
  message: string;
  type: string;
  recipient: string;
  selectedUserId: string;
}

interface NotificationFormProps {
  formData: NotificationFormData;
  setFormData: React.Dispatch<React.SetStateAction<NotificationFormData>>;
  users: any[];
  onSend: () => void;
  sending: boolean;
}

const NotificationForm: React.FC<NotificationFormProps> = ({
  formData,
  setFormData,
  users,
  onSend,
  sending
}) => {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-gray-900 dark:text-white flex items-center">
          <Send className="w-5 h-5 mr-2 text-fintech-orange" />
          Send Notification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Title</label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Notification title"
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Message</label>
          <Textarea
            value={formData.message}
            onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
            placeholder="Notification message"
            rows={4}
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Type</label>
          <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
            <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Recipients</label>
          <Select value={formData.recipient} onValueChange={(value) => setFormData(prev => ({ ...prev, recipient: value }))}>
            <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectItem value="all">
                <div className="flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  All Users
                </div>
              </SelectItem>
              <SelectItem value="specific">
                <div className="flex items-center">
                  <User className="w-4 h-4 mr-2" />
                  Specific User
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formData.recipient === 'specific' && (
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Select User</label>
            <Select value={formData.selectedUserId} onValueChange={(value) => setFormData(prev => ({ ...prev, selectedUserId: value }))}>
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue placeholder="Choose a user" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          onClick={onSend}
          disabled={sending || !formData.title || !formData.message || (formData.recipient === 'specific' && !formData.selectedUserId)}
          className="w-full bg-fintech-orange hover:bg-fintech-orange/90"
        >
          <Send className="w-4 h-4 mr-2" />
          {sending ? 'Sending...' : 'Send Notification'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default NotificationForm;

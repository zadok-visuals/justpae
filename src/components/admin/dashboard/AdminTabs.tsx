
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import TransactionManagement from '@/components/admin/TransactionManagement';
import UserManagement from '@/components/admin/UserManagement';
import NotificationCenter from '@/components/admin/NotificationCenter';
import SystemSettings from '@/components/admin/SystemSettings';
import AdminAnalytics from '@/components/admin/AdminAnalytics';
import GiftCardManagement from '@/components/admin/GiftCardManagement';
import FeedbackManagement from '@/components/admin/FeedbackManagement';
import { AdminChatManagement } from '@/components/admin/AdminChatManagement';

interface AdminTabsProps {
  stats: {
    pendingGiftCards: number;
    pendingTransactions: number;
    pendingKyc: number;
  };
  onStatsUpdate: () => void;
}

const AdminTabs: React.FC<AdminTabsProps> = ({ stats, onStatsUpdate }) => {
  return (
    <Tabs defaultValue="giftcards" className="space-y-6">
      <TabsList className="grid w-full grid-cols-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <TabsTrigger value="giftcards" className="data-[state=active]:bg-fintech-orange data-[state=active]:text-white relative">
          Gift Cards
          {stats.pendingGiftCards > 0 && (
            <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
              {stats.pendingGiftCards}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="transactions" className="data-[state=active]:bg-fintech-orange data-[state=active]:text-white relative">
          Transactions
          {stats.pendingTransactions > 0 && (
            <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
              {stats.pendingTransactions}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="users" className="data-[state=active]:bg-fintech-orange data-[state=active]:text-white relative">
          Users
          {stats.pendingKyc > 0 && (
            <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
              {stats.pendingKyc}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="feedback" className="data-[state=active]:bg-fintech-orange data-[state=active]:text-white">Feedback</TabsTrigger>
        <TabsTrigger value="chat" className="data-[state=active]:bg-fintech-orange data-[state=active]:text-white">Chat Support</TabsTrigger>
        <TabsTrigger value="notifications" className="data-[state=active]:bg-fintech-orange data-[state=active]:text-white">Notifications</TabsTrigger>
        <TabsTrigger value="analytics" className="data-[state=active]:bg-fintech-orange data-[state=active]:text-white">Analytics</TabsTrigger>
        <TabsTrigger value="settings" className="data-[state=active]:bg-fintech-orange data-[state=active]:text-white">Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="giftcards">
        <GiftCardManagement onStatsUpdate={onStatsUpdate} />
      </TabsContent>

      <TabsContent value="transactions">
        <TransactionManagement onStatsUpdate={onStatsUpdate} />
      </TabsContent>

      <TabsContent value="users">
        <UserManagement onStatsUpdate={onStatsUpdate} />
      </TabsContent>

      <TabsContent value="feedback">
        <FeedbackManagement />
      </TabsContent>

      <TabsContent value="chat">
        <AdminChatManagement />
      </TabsContent>

      <TabsContent value="notifications">
        <NotificationCenter />
      </TabsContent>

      <TabsContent value="analytics">
        <AdminAnalytics />
      </TabsContent>

      <TabsContent value="settings">
        <SystemSettings />
      </TabsContent>
    </Tabs>
  );
};

export default AdminTabs;

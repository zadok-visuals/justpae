
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
import AdminManagement from '@/components/admin/AdminManagement';
import { useAdminRole } from '@/hooks/useAdminRole';

interface AdminTabsProps {
  stats: {
    pendingGiftCards: number;
    pendingTransactions: number;
    pendingKyc: number;
    unreadChatCount: number;
  };
  onStatsUpdate: () => void;
}

const AdminTabs: React.FC<AdminTabsProps> = ({ stats, onStatsUpdate }) => {
  const { role } = useAdminRole();
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isModerator = role === 'moderator' || isAdmin;

  return (
    <Tabs defaultValue="giftcards" className="space-y-6">
      <div className="w-full overflow-x-auto pb-2 scrollbar-hide">
        <TabsList className="flex w-max min-w-full h-auto p-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <TabsTrigger value="chat" className="px-4 py-2 rounded-lg data-[state=active]:bg-fintech-orange data-[state=active]:text-white relative whitespace-nowrap">
            Chat Support
            {stats.unreadChatCount > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center rounded-full animate-pulse">
                {stats.unreadChatCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="giftcards" className="px-4 py-2 rounded-lg data-[state=active]:bg-fintech-orange data-[state=active]:text-white relative whitespace-nowrap">
            Gift Cards
            {stats.pendingGiftCards > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center rounded-full">
                {stats.pendingGiftCards}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="transactions" className="px-4 py-2 rounded-lg data-[state=active]:bg-fintech-orange data-[state=active]:text-white relative whitespace-nowrap">
            Transactions
            {stats.pendingTransactions > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center rounded-full">
                {stats.pendingTransactions}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="users" className="px-4 py-2 rounded-lg data-[state=active]:bg-fintech-orange data-[state=active]:text-white relative whitespace-nowrap">
            Users
            {stats.pendingKyc > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center rounded-full">
                {stats.pendingKyc}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="feedback" className="px-4 py-2 rounded-lg data-[state=active]:bg-fintech-orange data-[state=active]:text-white whitespace-nowrap">Feedback</TabsTrigger>
          <TabsTrigger value="notifications" className="px-4 py-2 rounded-lg data-[state=active]:bg-fintech-orange data-[state=active]:text-white whitespace-nowrap">Notifications</TabsTrigger>
          
          {isAdmin && (
            <TabsTrigger value="analytics" className="px-4 py-2 rounded-lg data-[state=active]:bg-fintech-orange data-[state=active]:text-white whitespace-nowrap">Analytics</TabsTrigger>
          )}
          
          {isSuperAdmin && (
            <>
              <TabsTrigger value="admins" className="px-4 py-2 rounded-lg data-[state=active]:bg-fintech-orange data-[state=active]:text-white whitespace-nowrap">Administrators</TabsTrigger>
              <TabsTrigger value="settings" className="px-4 py-2 rounded-lg data-[state=active]:bg-fintech-orange data-[state=active]:text-white whitespace-nowrap">Settings</TabsTrigger>
            </>
          )}
        </TabsList>
      </div>

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

      {isAdmin && (
        <TabsContent value="analytics">
          <AdminAnalytics />
        </TabsContent>
      )}

      {isSuperAdmin && (
        <>
          <TabsContent value="admins">
            <AdminManagement />
          </TabsContent>
          <TabsContent value="settings">
            <SystemSettings />
          </TabsContent>
        </>
      )}
    </Tabs>
  );
};

export default AdminTabs;

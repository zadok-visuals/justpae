
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserManagement } from '@/hooks/useUserManagement';
import UserFilters from './users/UserFilters';
import UserTable from './users/UserTable';
import UserDetailModal from './users/UserDetailModal';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  is_kyc_verified: boolean;
  account_status: string;
  created_at: string;
}

interface UserManagementProps {
  onStatsUpdate: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ onStatsUpdate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const {
    users,
    loading,
    processingAction,
    fetchUsers,
    handleKycAction,
    handleAccountAction
  } = useUserManagement(onStatsUpdate);

  useEffect(() => {
    fetchUsers(statusFilter);
  }, [statusFilter]);

  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-gray-900 dark:text-white">User Management</CardTitle>
        <UserFilters
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fintech-orange"></div>
          </div>
        ) : (
          <UserTable
            users={filteredUsers}
            onSelectUser={setSelectedUser}
          />
        )}

        <UserDetailModal
          user={selectedUser}
          isOpen={!!selectedUser}
          onClose={() => setSelectedUser(null)}
          onKycAction={handleKycAction}
          onAccountAction={handleAccountAction}
          processingAction={processingAction}
        />
      </CardContent>
    </Card>
  );
};

export default UserManagement;

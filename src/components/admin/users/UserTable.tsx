
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

interface UserTableProps {
  users: User[];
  onSelectUser: (user: User) => void;
  onChatUser?: (user: User) => void;
}

const UserTable: React.FC<UserTableProps> = ({ users, onSelectUser, onChatUser }) => {
  const getStatusBadge = (status: string) => {
    const variants = {
      active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      suspended: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      banned: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
      pending_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
    };
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-200 dark:border-gray-700">
            <TableHead className="text-gray-900 dark:text-white">User</TableHead>
            <TableHead className="text-gray-900 dark:text-white">Country</TableHead>
            <TableHead className="text-gray-900 dark:text-white">KYC Status</TableHead>
            <TableHead className="text-gray-900 dark:text-white">Account Status</TableHead>
            <TableHead className="text-gray-900 dark:text-white">Joined</TableHead>
            <TableHead className="text-gray-900 dark:text-white">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} className="border-gray-200 dark:border-gray-700">
              <TableCell className="text-gray-900 dark:text-white">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                </div>
              </TableCell>
              <TableCell className="text-gray-900 dark:text-white">{user.country || 'N/A'}</TableCell>
              <TableCell>
                <Badge className={user.is_kyc_verified ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'}>
                  {user.is_kyc_verified ? 'Verified' : 'Pending'}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge className={getStatusBadge(user.account_status)}>
                  {user.account_status}
                </Badge>
              </TableCell>
              <TableCell className="text-gray-900 dark:text-white">
                {new Date(user.created_at).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectUser(user)}
                    className="text-fintech-orange hover:bg-fintech-orange/10"
                  >
                    Manage
                  </Button>
                  {onChatUser && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onChatUser(user)}
                      className="text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                    >
                      Chat
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default UserTable;

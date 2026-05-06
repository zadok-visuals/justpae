
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, UserCheck, UserX, ShieldX } from 'lucide-react';

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

interface UserDetailModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onKycAction: (userId: string, action: 'approve' | 'reject' | 'revoke') => Promise<void>;
  onAccountAction: (userId: string, action: 'suspend' | 'activate') => Promise<void>;
  processingAction: boolean;
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({
  user,
  isOpen,
  onClose,
  onKycAction,
  onAccountAction,
  processingAction
}) => {
  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">User Management</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Name</label>
              <p className="text-gray-900 dark:text-white">{user.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Email</label>
              <p className="text-gray-900 dark:text-white">{user.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Phone</label>
              <p className="text-gray-900 dark:text-white">{user.phone || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Country</label>
              <p className="text-gray-900 dark:text-white">{user.country || 'N/A'}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {!user.is_kyc_verified ? (
              <>
                <Button
                  onClick={() => onKycAction(user.id, 'approve')}
                  disabled={processingAction}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  {processingAction ? 'Processing...' : 'Approve KYC'}
                </Button>
                <Button
                  onClick={() => onKycAction(user.id, 'reject')}
                  disabled={processingAction}
                  variant="destructive"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  {processingAction ? 'Processing...' : 'Reject KYC'}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => onKycAction(user.id, 'revoke')}
                disabled={processingAction}
                variant="outline"
                className="border-orange-300 text-orange-600"
              >
                <ShieldX className="w-4 h-4 mr-2" />
                {processingAction ? 'Processing...' : 'Revoke KYC'}
              </Button>
            )}

            {user.account_status === 'active' ? (
              <Button
                onClick={() => onAccountAction(user.id, 'suspend')}
                disabled={processingAction}
                variant="outline"
                className="border-red-300 text-red-600"
              >
                <UserX className="w-4 h-4 mr-2" />
                {processingAction ? 'Processing...' : 'Suspend Account'}
              </Button>
            ) : (
              <Button
                onClick={() => onAccountAction(user.id, 'activate')}
                disabled={processingAction}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {processingAction ? 'Processing...' : 'Activate Account'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserDetailModal;
